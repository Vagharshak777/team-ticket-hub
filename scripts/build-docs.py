#!/usr/bin/env python3
"""Render Mermaid sources when requested and build the offline diagram presentation."""
import argparse
import html
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DIAGRAMS = ROOT / "docs" / "diagrams"


def build(render=False, cli="mmdc", puppeteer_config=None):
    diagrams = json.loads((DIAGRAMS / "manifest.json").read_text())
    sections, navigation, index = [], [], ["# Diagram atlas", "", "Open [the offline presentation](../presentation.html) for navigation, zoom, speaker notes and printing.", "", "Mermaid `.mmd` files are the editable sources. SVG files are the rendered exports.", "", "| Diagram | Question it answers | Source |", "| --- | --- | --- |"]
    ids = set()
    for number, item in enumerate(diagrams, 1):
        identifier = item["id"]
        if identifier in ids or Path(identifier).name != identifier:
            raise ValueError("Diagram IDs must be unique filenames")
        ids.add(identifier)
        source = DIAGRAMS / (identifier + ".mmd")
        svg = DIAGRAMS / (identifier + ".svg")
        if not source.is_file():
            raise ValueError("Missing source: " + str(source))
        for proof in item["proof"]:
            if not (ROOT / proof).is_file():
                raise ValueError("Missing source reference: " + proof)
        if render:
            command = [cli, "-i", str(source), "-o", str(svg), "-c", str(DIAGRAMS / "mermaid-config.json"), "-b", "white", "--size", "1800", "--no-font-embed", "-I", identifier]
            if puppeteer_config:
                command.extend(["-p", str(Path(puppeteer_config).resolve())])
            subprocess.run(command, check=True)
        if ET.parse(svg).getroot().tag != "{http://www.w3.org/2000/svg}svg":
            raise ValueError("Invalid SVG: " + str(svg))
        escape = html.escape
        links = "".join('<a href="../' + escape(path, quote=True) + '">' + escape(path) + '</a>' for path in item["proof"])
        notes = "".join("<li>" + escape(note) + "</li>" for note in item["notes"])
        image = svg.read_text()
        sections.append(f'''<section class="slide" id="{identifier}" aria-labelledby="title-{identifier}">
<div class="slide-head"><span class="eyebrow">{number:02d} / {len(diagrams):02d} · {escape(item['scope'])}</span><h2 id="title-{identifier}">{escape(item['title'])}</h2><p class="question">{escape(item['question'])}</p></div>
<div class="diagram-frame" tabindex="0" aria-label="Diagram: {escape(item['title'], quote=True)}">{image}</div>
<div class="notes"><div><h3>Understand it</h3><ul>{notes}</ul></div><aside><h3>Practice saying</h3><p>{escape(item['say'])}</p><h3>Open the evidence</h3><div class="proof">{links}</div><a class="export" href="diagrams/{identifier}.svg" download>Download SVG ↗</a></aside></div>
</section>''')
        navigation.append(f'<button class="nav-item" data-slide="{number - 1}" aria-controls="{identifier}"><span>{number:02d}</span>{escape(item["title"])}</button>')
        index.append(f'| [{number:02d} · {item["title"]}]({identifier}.svg) | {item["question"]} | [Mermaid]({identifier}.mmd) |')
    template = (ROOT / "docs" / "presentation-template.html").read_text()
    output = template.replace("<!-- NAVIGATION -->", "\n".join(navigation)).replace("<!-- DIAGRAMS -->", "\n".join(sections))
    (ROOT / "docs" / "presentation.html").write_text(output)
    (DIAGRAMS / "README.md").write_text("\n".join(index) + "\n\nSee [diagram tooling](../diagram-tooling.md) to edit and regenerate these files.\n")
    print(f"Built offline presentation and index for {len(diagrams)} validated diagrams.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render", action="store_true", help="Regenerate SVG exports with Mermaid CLI")
    parser.add_argument("--mermaid-cli", default="mmdc", help="Path to an installed Mermaid CLI executable")
    parser.add_argument("--puppeteer-config", type=Path, help="Optional Chrome executable configuration")
    arguments = parser.parse_args()
    build(arguments.render, arguments.mermaid_cli, arguments.puppeteer_config)
