"""林离（Olivia Lin）回信人格 Skill。

- loader.py       组装 system prompt（persona + 书信技艺 + few-shot）
- model_client.py 模型空壳客户端（http://127.0.0.1:8045，含超时与降级）
- local_engine.py 离线人格引擎（模型不可达时的响应式降级）
"""

__all__ = ["loader", "model_client", "local_engine"]
