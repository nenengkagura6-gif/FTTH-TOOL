---
title: "KML best practices for FTTH rollouts"
excerpt: "Naming conventions, folder structure, and styling that survive handoffs."
category: "KML Mapping"
readTime: "6 min"
date: "Apr 29, 2026"
image: "/blog/kml-best-practices.png"
cta: "kml-checker"
---

Google Earth KML (Keyhole Markup Language) has become the de-facto standard for preliminary design and field surveys in FTTH network deployments. However, without strict formatting standards, KML files can quickly become a disorganized mess that causes delays during engineering design and material estimation.

Here are the best practices for structuring KML files for FTTH projects.

## 1. Implement Standard Naming Conventions
Every element inside your KML file should follow a consistent naming format. This allows automated parsers (like the ones on this website!) to correctly categorize items.

* **Poles (Tiang)**: Use prefixes like `PL-` or `POLE-` followed by a unique number.
  * *Example:* `PL-CBN01-001`
* **Homepasses (HP / Pelanggan)**: Use prefixes like `HP-` or `H-` followed by the address or coordinate ID.
  * *Example:* `HP-JL-MAWAR-12`
* **Fiber Cables**: Name paths based on their type and capacity.
  * *Example:* `CABLE-12C-AERIAL` or `FEEDER-24C`

## 2. Separate Layouts Into Folders
Never dump all place marks and paths into the root directory of your KML file. Use Google Earth's folder structure to group items logically:

```
├── [PROJECT_NAME]
│   ├── FDC (Cabinets)
│   ├── FAT (Distribution Boxes)
│   ├── POLES (Tiang)
│   ├── CABLES (Jalur Kabel)
│   └── HOMEPASS (Customer Points)
```

Keeping folders separated prevents tools from misinterpreting a cable path as a boundary or a pole point as a cabinet.

## 3. Avoid Point Duplications
One of the most common issues in collaborative KML mapping is duplicate points. Multiple surveyors might pin the same pole twice or mark the same house under different names. 
* Duplications distort material calculation (BOQs), leading to overbudgeting.
* Before finalizing your KML for production, run it through the [KML Duplicate Checker](/dashboard/kml-checker) to clean up overlapping points automatically.

## 4. Convert KML directly to Bill of Materials (BOQ)
Once you have structured your KML correctly:
1. Export it as `.kml` or `.kmz`.
2. Go to our [KML to BOQ Tool](/dashboard/kml-boq).
3. Upload your KML alongside your material excel template.
4. Get your fully calculated BOQ within seconds!
