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


def build(render=False, cli="mmdc", puppeteer_config=None, language="en"):
    folder = DIAGRAMS / "hy" if language == "hy" else DIAGRAMS
    diagram_url = "diagrams/hy" if language == "hy" else "diagrams"
    diagrams = json.loads((folder / "manifest.json").read_text())
    sections, navigation, index = [], [], ["# Diagram atlas", "", "Open [the offline presentation](../presentation.html) for navigation, zoom, speaker notes and printing.", "", "Mermaid `.mmd` files are the editable sources. SVG files are the rendered exports.", "", "| Diagram | Question it answers | Source |", "| --- | --- | --- |"]
    ids = set()
    for number, item in enumerate(diagrams, 1):
        identifier = item["id"]
        if identifier in ids or Path(identifier).name != identifier:
            raise ValueError("Diagram IDs must be unique filenames")
        ids.add(identifier)
        source = folder / (identifier + ".mmd")
        svg = folder / (identifier + ".svg")
        if not source.is_file():
            raise ValueError("Missing source: " + str(source))
        for proof in item["proof"]:
            if not (ROOT / proof).is_file():
                raise ValueError("Missing source reference: " + proof)
        if render:
            command = [cli, "-i", str(source), "-o", str(svg), "-c", str(DIAGRAMS / "mermaid-config.json"), "-b", "white", "--size", "1800", "--no-font-embed", "-I", "diagram-" + identifier]
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
<div class="notes"><div><h3>Understand it</h3><ul>{notes}</ul></div><aside><h3>Practice saying</h3><p>{escape(item['say'])}</p><h3>Open the evidence</h3><div class="proof">{links}</div><a class="export" href="{diagram_url}/{identifier}.svg" download>Download SVG ↗</a></aside></div>
</section>''')
        navigation.append(f'<button class="nav-item" data-slide="{number - 1}" aria-controls="{identifier}"><span>{number:02d}</span>{escape(item["title"])}</button>')
        index.append(f'| [{number:02d} · {item["title"]}]({identifier}.svg) | {item["question"]} | [Mermaid]({identifier}.mmd) |')
    template = (ROOT / "docs" / "presentation-template.html").read_text()
    ui = {
        'Architecture walkthrough': 'Ճարտարապետության ներկայացում',
        'Architecture you can explain.': 'Ճարտարապետություն, որը կարող եք բացատրել։',
        'Presentation navigation': 'Ներկայացման նավարկում', 'Choose a diagram': 'Ընտրել գծապատկերը',
        'Local Docker stack verified': 'Տեղական Docker միջավայրը ստուգված է',
        '23 October 2026': '23 հոկտեմբերի 2026',
        'Public VPS delivery is a separate acceptance exercise.': 'Հանրային VPS տեղակայումը պահանջում է առանձին ընդունման փորձարկում։',
        'Project README': 'Նախագծի նկարագրություն', 'Interview guide': 'Հարցազրույցի ուղեցույց', 'Learning path': 'Ուսուցման ուղի',
        'Read the diagram. Follow the evidence. Explain the decision.': 'Կարդացեք գծապատկերը։ Հետևեք ապացույցներին։ Բացատրեք որոշումը։',
        'Presentation controls': 'Ներկայացման կառավարում', 'Previous diagram': 'Նախորդ գծապատկերը', 'Next diagram': 'Հաջորդ գծապատկերը',
        'Zoom out': 'Փոքրացնել', 'Zoom in': 'Մեծացնել', '>Fit<': '>Տեղավորել<', '>Notes<': '>Նշումներ<',
        'Print / PDF': 'Տպել / PDF',
        'Arrow keys change diagrams · + / − zoom · 0 fits · Notes toggles explanations · Print exports all diagrams. Use the interview scripts after you can demonstrate their behavior and describe your own contribution.': 'Սլաքները փոխում են գծապատկերը · + / − մեծացնում կամ փոքրացնում են · 0՝ տեղավորել · Նշումներ՝ բացատրությունները · Տպել՝ բոլոր գծապատկերները։ Ներկայացնելիս նկարագրեք ձեր իրական ներդրումը։',
    }
    if language == "hy":
        template = template.replace('lang="en"', 'lang="hy"')
        for original, translated in ui.items():
            template = template.replace(original, translated)
        sections = [section.replace('Understand it', 'Բացատրություն').replace('Practice saying', 'Փորձեք ներկայացնել').replace('Open the evidence', 'Աղբյուրներ').replace('Download SVG', 'Ներբեռնել SVG').replace('aria-label="Diagram:', 'aria-label="Գծապատկեր՝') for section in sections]
    other = '<a href="presentation.html" lang="en">English</a>' if language == "hy" else '<a href="presentation.hy.html" lang="hy">Հայերեն</a>'
    template = template.replace('<!-- LANGUAGE -->', other)
    output = template.replace("<!-- NAVIGATION -->", "\n".join(navigation)).replace("<!-- DIAGRAMS -->", "\n".join(sections))
    (ROOT / "docs" / ("presentation.hy.html" if language == "hy" else "presentation.html")).write_text(output)
    if language == "hy":
        index[0] = "# Գծապատկերների հավաքածու"
        index[2] = "Բացել [հայերեն ներկայացումը](../../presentation.hy.html)՝ նավարկման, նշումների և տպման համար։"
        index[4] = "Mermaid `.mmd` ֆայլերը խմբագրվող աղբյուրներն են, SVG ֆայլերը՝ արտահանված պատկերները։"
        index[6] = "| Գծապատկեր | Հարց | Աղբյուր |"
    (folder / "README.md").write_text("\n".join(index) + "\n")
    print(f"Built offline presentation and index for {len(diagrams)} validated diagrams.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render", action="store_true", help="Regenerate SVG exports with Mermaid CLI")
    parser.add_argument("--mermaid-cli", default="mmdc", help="Path to an installed Mermaid CLI executable")
    parser.add_argument("--puppeteer-config", type=Path, help="Optional Chrome executable configuration")
    parser.add_argument("--language", choices=["en", "hy"], default="en", help="Presentation and diagram language")
    arguments = parser.parse_args()
    build(arguments.render, arguments.mermaid_cli, arguments.puppeteer_config, arguments.language)
