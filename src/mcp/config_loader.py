"""
MCP configuration loader supporting global ~/.gsd/mcp.json fallback.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional


def load_mcp_config(project_root: str = ".") -> Dict[str, Any]:
    """Load MCP server config from project or global location."""
    project_path = Path(project_root) / ".gsd" / "mcp.json"
    global_path = Path.home() / ".gsd" / "mcp.json"

    config = {}
    if project_path.exists():
        with open(project_path) as f:
            config.update(json.load(f))

    if global_path.exists():
        with open(global_path) as f:
            global_cfg = json.load(f)
            for name, cfg in global_cfg.items():
                if name not in config:
                    config[name] = cfg

    return config


def save_mcp_config(config: Dict[str, Any], project_root: str = ".", global_scope: bool = False) -> None:
    """Save MCP server config to project or global location."""
    target = Path.home() / ".gsd" / "mcp.json" if global_scope else Path(project_root) / ".gsd" / "mcp.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w") as f:
        json.dump(config, f, indent=2)


def list_mcp_servers(config: Dict[str, Any]) -> list:
    return list(config.keys())
