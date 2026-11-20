from __future__ import annotations

import hashlib
import hmac
import json
import os
import tempfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import httpx
from celery import Celery
from sqlalchemy import select

from database import SessionLocal
from models import (
    Atleta,
    LogAuditoria,
    MetricaBiomecanica,
    SessaoAnalise,
    StatusProcessamentoEnum,
    WebhookB2B,
)
from storage import ObjectStorageClient
from vision_engine import KinePitchVisionEngine

REDIS_URL = os.getenv("REDIS_URL", "redis://:changeme_redis_dev@localhost:6379/0")

celery_app = Celery(
    "kinepitch_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


def _sha256_json(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _disparar_webhooks_clube(
    db,
    clube_id: int,
    evento: str,
    payload: dict,
) -> list[dict]:
    webhooks = db.scalars(
        select(WebhookB2B).where(WebhookB2B.clube_id == clube_id, WebhookB2B.ativo.is_(True))
    ).all()

    resultados: list[dict] = []
    body_bytes = json.dumps(payload, default=str).encode("utf-8")

    for wh in webhooks:
        if evento not in (wh.eventos_assinados or []):
            continue

        assinatura = hmac.new(
            wh.secret_hmac_sha256_hash.encode("utf-8"),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()

        headers = {
            "Content-Type": "application/json",
            "X-KinePitch-Event": evento,
            "X-KinePitch-Signature": f"sha256={assinatura}",
            **(wh.headers_custom or {}),
        }

        status_http: int | None = None
        entregue = False
        erro: str | None = None

        try:
            with httpx.Client(timeout=6.0) as client:
                resp = client.post(wh.endpoint_url, content=body_bytes, headers=headers)
                status_http = resp.status_code
                entregue = 200 <= resp.status_code < 300
        except Exception as exc:
            erro = str(exc)

        wh.ultima_entrega_em = datetime.now(timezone.utc)
        wh.ultimo_status_http = status_http
        if entregue:
            wh.total_falhas_consecutivas = 0
        else:
            wh.total_falhas_consecutivas = (wh.total_falhas_consecutivas or 0) + 1

        resultados.append(
            {
                "webhook_id": wh.id,
                "nome_integracao": wh.nome_integracao,
                "status_http": status_http,
                "entregue": entregue,
                "erro": erro,
            }
        )
    return resultados


@celery_app.task(bind=True, name="kinepitch.processar_video_biomecanico")
def processar_video_biomecanico(self, sessao_id: int) -> dict:
    """
    Worker assíncrono Celery + Redis:
    1. Baixa o vídeo bruto do bucket MinIO/S3
    2. Executa OpenCV + YOLOv8-Pose (22 pontos, ângulos, assimetria >15%, 4 KPIs)
    3. Sobe o vídeo overlay anotado para o bucket de overlays
    4. Persiste MetricaBiomecanica + atualiza SessaoAnalise + dispara Webhooks B2B
    """
    db = SessionLocal()
    storage = ObjectStorageClient()
    engine = KinePitchVisionEngine()

    try:
        sessao = db.get(SessaoAnalise, sessao_id)
        if sessao is None:
            raise ValueError(f"Sessão {sessao_id} não encontrada no PostgreSQL.")

        atleta = db.get(Atleta, sessao.atleta_id)
        if atleta is None:
            raise ValueError(f"Atleta {sessao.atleta_id} não encontrado.")

        sessao.status_processamento = StatusProcessamentoEnum.processando_ia
        sessao.progresso_percentual = 15
        sessao.worker_gpu_node = os.getenv("WORKER_NODE_NAME", "celery-vision-worker-01")
        sessao.redis_job_id = str(self.request.id)
        db.commit()

        with tempfile.TemporaryDirectory(prefix=f"kinepitch_s{sessao_id}_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            raw_video_path = tmp_path / "raw_input.mp4"
            overlay_video_path = tmp_path / "overlay_22pts.mp4"

            storage.download_to_temp(
                bucket_name=sessao.video_s3_bucket,
                object_key=sessao.video_s3_key,
                dest_path=raw_video_path,
            )

            sessao.progresso_percentual = 45
            db.commit()

            resultado = engine.analisar_video(
                video_path=raw_video_path,
                estatura_cm=float(atleta.estatura_cm),
                massa_corporal_kg=float(atleta.massa_corporal_kg),
                posicao=atleta.posicao_primaria.value,
                pe_dominante=atleta.pe_dominante.value,
                overlay_output_path=overlay_video_path,
            )

            sessao.progresso_percentual = 82
            db.commit()

            overlay_key = f"overlays/{sessao.clube_id}/{sessao.codigo_sessao}_overlay.mp4"
            storage.ensure_bucket_exists(storage.bucket_overlay)
            if overlay_video_path.exists():
                storage.upload_file(
                    src_path=overlay_video_path,
                    bucket_name=storage.bucket_overlay,
                    object_key=overlay_key,
                    content_type="video/mp4",
                )
                sessao.video_overlay_s3_key = overlay_key

        # Persiste métricas biomecânicas (22 pontos + 4 KPIs)
        metrica = db.scalar(
            select(MetricaBiomecanica).where(MetricaBiomecanica.sessao_id == sessao.id)
        )
        if metrica is None:
            metrica = MetricaBiomecanica(sessao_id=sessao.id, atleta_id=atleta.id)
            db.add(metrica)

        metrica.frame_referencia = resultado.frame_referencia
        metrica.timestamp_segundos = Decimal(str(resultado.timestamp_segundos))
        metrica.ipb_prontidao_biomecanica = Decimal(str(resultado.ipb_prontidao_biomecanica))
        metrica.spe_potencia_explosao = Decimal(str(resultado.spe_potencia_explosao))
        metrica.ietp_eficiencia_tecnica = Decimal(str(resultado.ietp_eficiencia_tecnica))
        metrica.ips_potencial_scouting = Decimal(str(resultado.ips_potencial_scouting))
        metrica.pontos_opticos_22 = resultado.pontos_opticos_22
        metrica.confianca_rastreamento_pct = Decimal(str(resultado.confianca_rastreamento_pct))
        metrica.flexao_joelho_esq_graus = Decimal(str(resultado.flexao_joelho_esq_graus))
        metrica.flexao_joelho_dir_graus = Decimal(str(resultado.flexao_joelho_dir_graus))
        metrica.extensao_joelho_chute_graus = Decimal(str(resultado.extensao_joelho_chute_graus))
        metrica.rotacao_quadril_graus = Decimal(str(resultado.rotacao_quadril_graus))
        metrica.inclinacao_pelvica_lateral_graus = Decimal(str(resultado.inclinacao_pelvica_lateral_graus))
        metrica.dorsiflexao_tornozelo_graus = Decimal(str(resultado.dorsiflexao_tornozelo_graus))
        metrica.valgo_dinamico_joelho_graus = Decimal(str(resultado.valgo_dinamico_joelho_graus))
        metrica.velocidade_pico_kmh = Decimal(str(resultado.velocidade_pico_kmh))
        metrica.velocidade_pe_chute_kmh = Decimal(str(resultado.velocidade_pe_chute_kmh))
        metrica.velocidade_bola_kmh = Decimal(str(resultado.velocidade_bola_kmh))
        metrica.split_0_10m_seg = Decimal(str(resultado.split_0_10m_seg))
        metrica.desaceleracao_max_ms2 = Decimal(str(resultado.desaceleracao_max_ms2))
        metrica.vetor_grf_bw = Decimal(str(resultado.vetor_grf_bw))
        metrica.torque_articular_nm = Decimal(str(resultado.torque_articular_nm))
        metrica.velocidade_angular_joelho_graus_s = Decimal(str(resultado.velocidade_angular_joelho_graus_s))
        metrica.altura_salto_cm = Decimal(str(resultado.altura_salto_cm))
        metrica.rsi_reativo = Decimal(str(resultado.rsi_reativo))
        metrica.assimetria_bilateral_pct = Decimal(str(resultado.assimetria_bilateral_pct))

        sessao.total_frames = resultado.total_frames
        sessao.duracao_segundos = Decimal(str(resultado.duracao_segundos))
        sessao.latencia_inferencia_ms = Decimal(str(resultado.latencia_inferencia_ms))
        sessao.keyframes_criticos = resultado.keyframes_criticos
        sessao.sintese_ia_texto = resultado.sintese_ia_texto
        sessao.status_processamento = StatusProcessamentoEnum.concluida
        sessao.progresso_percentual = 100
        sessao.concluida_em = datetime.now(timezone.utc)

        audit_payload = {
            "sessao_id": sessao.id,
            "atleta_id": atleta.id,
            "assimetria_pct": resultado.assimetria_bilateral_pct,
            "alerta_assimetria_critica": resultado.alerta_assimetria_critica,
            "kpis": {
                "ipb": resultado.ipb_prontidao_biomecanica,
                "spe": resultado.spe_potencia_explosao,
                "ietp": resultado.ietp_eficiencia_tecnica,
                "ips": resultado.ips_potencial_scouting,
            },
        }
        db.add(
            LogAuditoria(
                acao="SESSAO_BIOMECANICA_CONCLUIDA",
                entidade="sessoes_analise",
                entidade_id=str(sessao.id),
                hash_assinatura=_sha256_json(audit_payload),
                metadata_json=audit_payload,
            )
        )

        # Dispara Webhook B2B para conclusão e alerta se assimetria > 15%
        _disparar_webhooks_clube(db, sessao.clube_id, "sessao.concluida", audit_payload)
        if resultado.alerta_assimetria_critica:
            _disparar_webhooks_clube(db, sessao.clube_id, "alerta.assimetria_critica", audit_payload)

        db.commit()
        return {
            "sessao_id": sessao.id,
            "status": "concluida",
            "alerta_assimetria_critica": resultado.alerta_assimetria_critica,
            "assimetria_bilateral_pct": resultado.assimetria_bilateral_pct,
        }

    except Exception as exc:
        db.rollback()
        sessao = db.get(SessaoAnalise, sessao_id)
        if sessao is not None:
            sessao.status_processamento = StatusProcessamentoEnum.erro_calibracao
            sessao.sintese_ia_texto = f"Falha no processamento biomecânico: {exc}"
            db.commit()
        raise
    finally:
        db.close()
