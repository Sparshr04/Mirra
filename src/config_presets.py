"""
src/config_presets.py
─────────────────────
Preset resolution for the Mirra reconstruction pipeline.

Applies predefined speed/quality profiles (draft, default, high_quality)
as a BASE LAYER. User-specified CLI arguments ALWAYS have the final say.

Merge Priority (highest wins):
  1. CLI overrides  (e.g., `stride=400 vggt_resolution=256`)
  2. Preset values  (e.g., `draft` sets stride=200)
  3. config.yaml    (file-level defaults)

How it works:
  Hydra merges CLI args into the DictConfig BEFORE apply_preset() runs.
  We query HydraConfig.get().overrides.task to get the EXACT list of CLI
  overrides the user typed. This is authoritative — no fragile heuristics
  comparing against hardcoded file defaults.

  1. Parse CLI overrides from Hydra's own override list
  2. Apply preset values as a base layer
  3. Re-apply CLI overrides on top (user always wins)

Usage in main.py:
    from src.config_presets import apply_preset
    cfg = apply_preset(cfg)
"""

from omegaconf import DictConfig, OmegaConf


# ─── Preset Definitions ─────────────────────────────────────────────

PRESETS = {
    "draft": {
        "stride": 200,
        "resolution": 384,
        "dust3r_batch_size": 1,
        "max_photos": 10,
        "parallel_stages": False,
        "enable_denoiser": False,
        "semantics.keyframe_interval": 20,
        "semantics.max_objects": 15,
        "tsdf.voxel_length": 0.010,
        "tsdf.sdf_trunc": 0.050,
        "tsdf.depth_trunc": 3.0,
    },
    "default": {
        "stride": 100,
        "resolution": 512,
        "dust3r_batch_size": 1,
        "max_photos": 15,
        "parallel_stages": False,
        "enable_denoiser": True,
        "semantics.keyframe_interval": 10,
        "semantics.max_objects": 30,
        "tsdf.voxel_length": 0.006,
        "tsdf.sdf_trunc": 0.030,
        "tsdf.depth_trunc": 5.0,
    },
    "high_quality": {
        "stride": 50,
        "resolution": 512,
        "dust3r_batch_size": 1,
        "max_photos": 15,
        "parallel_stages": False,
        "enable_denoiser": True,
        "semantics.keyframe_interval": 5,
        "semantics.max_objects": 50,
        "tsdf.voxel_length": 0.004,
        "tsdf.sdf_trunc": 0.020,
        "tsdf.depth_trunc": 10.0,
    },
}


# ─── Helpers ─────────────────────────────────────────────────────────


def _set_nested(cfg: DictConfig, dotted_key: str, value) -> None:
    """Set a value in an OmegaConf config using a dotted key path.

    Uses OmegaConf.update for robust nested key handling.
    Silently skips if the key path doesn't exist in the config schema.
    """
    keys = dotted_key.split(".")
    node = cfg
    for key in keys[:-1]:
        if not OmegaConf.is_dict(node) or key not in node:
            return
        node = node[key]
    final_key = keys[-1]
    if final_key not in node:
        return
    OmegaConf.update(cfg, dotted_key, value, merge=False)


def _parse_cli_overrides() -> dict:
    """Extract user CLI overrides from Hydra's authoritative override list.

    Uses HydraConfig.get().overrides.task — the exact list of `key=value`
    arguments the user typed on the command line. This is the ONLY reliable
    way to distinguish "user explicitly set stride=100" from "stride=100
    because that's the config.yaml default".

    Falls back to an empty dict if HydraConfig is unavailable (e.g., when
    running outside Hydra context, such as in unit tests or subprocesses).

    Returns:
        Dict of {dotted_key: parsed_value} for all user CLI overrides.
    """
    try:
        # HydraConfig is only available inside a @hydra.main decorated function
        from hydra.core.hydra_config import HydraConfig
        hydra_cfg = HydraConfig.get()
        raw_overrides = hydra_cfg.overrides.task  # List[str] e.g. ["preset=draft", "stride=400"]
    except Exception:
        # Outside Hydra context (tests, subprocess workers, direct calls)
        return {}

    overrides = {}
    for override_str in raw_overrides:
        # Hydra overrides are in the form "key=value" or "+key=value" or "~key"
        # We only care about simple "key=value" overrides
        if "=" not in override_str:
            continue

        # Strip Hydra override prefixes (+, ++, ~)
        clean = override_str.lstrip("+~")
        key, _, raw_value = clean.partition("=")
        key = key.strip()
        raw_value = raw_value.strip()

        # Parse the value to its Python type
        overrides[key] = _parse_value(raw_value)

    return overrides


def _parse_value(raw: str):
    """Parse a CLI value string into its Python type.

    Handles: int, float, bool, null, and strings (with optional quotes).
    """
    # Strip quotes
    if (raw.startswith('"') and raw.endswith('"')) or \
       (raw.startswith("'") and raw.endswith("'")):
        return raw[1:-1]

    # Booleans (Hydra/YAML convention)
    lower = raw.lower()
    if lower in ("true", "yes", "on"):
        return True
    if lower in ("false", "no", "off"):
        return False

    # Null
    if lower in ("null", "none", "~"):
        return None

    # Integer
    try:
        return int(raw)
    except ValueError:
        pass

    # Float
    try:
        return float(raw)
    except ValueError:
        pass

    # Default: string
    return raw


# ─── Main Entry Point ───────────────────────────────────────────────


def apply_preset(cfg: DictConfig) -> DictConfig:
    """Apply a preset profile to the config, respecting CLI overrides.

    Merge order:
      1. Start with config.yaml values (already in cfg via Hydra)
      2. Apply preset overrides on top
      3. Re-apply CLI overrides on top (user ALWAYS wins)

    The CLI overrides are sourced from HydraConfig.get().overrides.task,
    which is the authoritative list of what the user actually typed.
    This eliminates the fragile heuristic of comparing against hardcoded
    file defaults.

    Args:
        cfg: The Hydra-merged DictConfig (config.yaml + CLI args).

    Returns:
        The config with preset applied, CLI overrides preserved.
    """
    # ── Step 1: Capture CLI overrides from Hydra (AUTHORITATIVE) ─────
    cli_overrides = _parse_cli_overrides()

    # ── Step 2: Resolve preset name ──────────────────────────────────
    # The preset may itself be a CLI override (e.g., `preset=draft`)
    preset_name = cli_overrides.get("preset", cfg.get("preset", "default"))

    if preset_name not in PRESETS:
        valid = ", ".join(PRESETS.keys())
        print(
            f"⚠️  Unknown preset '{preset_name}'. "
            f"Valid presets: {valid}. Falling back to 'default'."
        )
        preset_name = "default"

    preset_values = PRESETS[preset_name]

    print(f"📐 Applying preset: '{preset_name}'")

    # ── Step 3: Apply preset values as the base layer ────────────────
    # These override config.yaml defaults but NOT CLI args.
    for dotted_key, value in preset_values.items():
        _set_nested(cfg, dotted_key, value)

    # ── Step 4: Re-apply CLI overrides (USER ALWAYS WINS) ────────────
    # Filter out 'preset' itself — it's already been consumed above.
    user_overrides = {
        k: v for k, v in cli_overrides.items() if k != "preset"
    }

    if user_overrides:
        cli_keys = ", ".join(f"{k}={v}" for k, v in user_overrides.items())
        print(f"   🔧 CLI overrides applied: {cli_keys}")

        for dotted_key, value in user_overrides.items():
            _set_nested(cfg, dotted_key, value)

    # ── Print resolved values for transparency ───────────────────────
    print(f"   stride={cfg.stride}, resolution={cfg.resolution}")
    print(f"   dust3r_batch_size={cfg.get('dust3r_batch_size', 1)}, "
          f"max_photos={cfg.get('max_photos', 15)}")
    print(f"   parallel_stages={cfg.parallel_stages}, "
          f"enable_denoiser={cfg.enable_denoiser}")
    print(f"   keyframe_interval={cfg.semantics.keyframe_interval}, "
          f"max_objects={cfg.semantics.get('max_objects', 30)}")
    print(f"   tsdf: voxel={cfg.tsdf.voxel_length}m, "
          f"trunc={cfg.tsdf.sdf_trunc}m, "
          f"depth_max={cfg.tsdf.depth_trunc}m")

    return cfg
