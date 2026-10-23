#!/usr/bin/env python3
"""Create local Grafana and Dozzle credentials without putting passwords in arguments."""
import getpass
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
directory = root / "secrets"
directory.mkdir(mode=0o700, exist_ok=True)
directory.chmod(0o700)


def password(label):
    value = getpass.getpass(label + " password (at least 16 characters): ")
    if len(value) < 16 or value != getpass.getpass("Confirm password: "):
        raise ValueError("Passwords must match and contain at least 16 characters.")
    return value


def write(name, value):
    with (directory / name).open("x") as output:
        os.chmod(output.name, 0o600)
        output.write(value)
    # Compose file secrets are bind mounts. The container user must read them;
    # the enclosing 0700 directory restricts host access.
    (directory / name).chmod(0o444)


if not (directory / "grafana-admin-password").exists():
    write("grafana-admin-password", password("Grafana") + "\n")
if not (directory / "dozzle-users.yml").exists():
    config = json.loads(subprocess.run(
        ["docker", "compose", "-f", str(root / "compose.ops.yml"), "config", "--format", "json"],
        check=True, capture_output=True, text=True).stdout)
    image = config["services"]["dozzle"]["image"]
    subprocess.run(["docker", "pull", image], check=True, stdout=subprocess.DEVNULL)
    result = subprocess.run(
        ["docker", "run", "--rm", "-i", "--network", "none", "-e", "DOZZLE_NO_ANALYTICS=true",
         image, "generate", "admin", "--name", "POC Operator", "--user-roles", "none"],
        input=password("Dozzle") + "\n", check=True, capture_output=True, text=True)
    if not result.stdout.strip().startswith("users:"):
        raise ValueError("Dozzle did not produce the expected users configuration.")
    write("dozzle-users.yml", result.stdout)
print("Local credential files are ready. Existing files were preserved.")
