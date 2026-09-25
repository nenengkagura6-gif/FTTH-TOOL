---
title: "The FTTH Drafter Workflow: From HP Tagging to CAD Drawings"
excerpt: "Eight automated steps that turn a cluster boundary into an APD design, HP database, BOQ, and handover-ready AutoCAD drawings."
category: "FTTH Tutorials"
readTime: "9 min"
date: "Sep 25, 2026"
image: "/blog/alur-kerja-drafter-ftth-en.jpg"
cta: "drafter-suite"
---

An FTTH drafter rarely works on a single file. From one cluster boundary, the drafter has to tag houses, draw a basic map, build the APD design, fill the homepass database, compute the BOQ, and finally hand over AutoCAD drawings complete with a title block and DESIGN SUMMARY. Done by hand, a single cluster can take days, and every step is a chance to miscount.

This article walks through the order we use in the **Drafter** menu and what to prepare at each step so the output is usable right away.

## The Workflow at a Glance

```
Cluster boundary
  -> 1. Auto Tagging HP        (house points NN-01, NN-02, ...)
  -> 2. KML To BasicMap        (house blocks + roads -> DXF)
  -> 3. KML To APD             (FAT, cables, sling, pole numbering)
  -> 4. KML to Database HP     (HPDB Excel per FDT)
  -> 5. KML to BOQ             (BOQ Excel per FDT)
  -> 6. KML to CAD             (design drawing -> DXF + DESIGN SUMMARY)
  -> 7. Auto Coding APD        (FDT/FAT/cable/pole codes)
  -> 8. Pole Auto-Sorter       (clean up pole numbers)
```

Every tool takes a KML/KMZ and returns output the next tool can use. Each one also shows a **result report** when it finishes: key counts (FAT, poles, HP) and a list of items to review. Skipped data no longer hides behind a "success" status.

## 1. Auto Tagging HP
Start with the cluster boundary polygon drawn in Google Earth. [Auto Tagging HP](/dashboard/auto-placemark) pulls building and road data from OpenStreetMap, keeps only the houses that actually face a road (the front row), and creates a placemark for each one.

Points are named **NN-01, NN-02, and so on**, numbered along each road instead of jumping north to south. Always verify the result in the field, especially where OpenStreetMap building data is incomplete.

## 2. KML To BasicMap
[KML To BasicMap](/dashboard/basicmap) turns HP points into **house blocks** that face the road, line up with their neighbours, and never overlap. Road edges and names come from OpenStreetMap. You get a DXF (1 unit = 1 metre), a `_jalan.csv` road list, and a processing log.

> **Tip:** roads without a name in OpenStreetMap can be filled in the `nama_dipakai` column of `_jalan.csv`. Upload that CSV when you reprocess the same KML and the names will be drawn.

## 3. KML To APD
This is the heart of the design. [KML To APD](/dashboard/kml-apd) reads the LINE, BOUNDARY, DISTRIBUTION cable, pole (POLE/NP/EXT), HP, and FDT folders, then:
* names FAT boundaries (A01, A02, ...) and assigns HPs to them,
* places FATs on poles along the cable route,
* computes cable length, slack, and tolerance per segment,
* draws sling wire between poles,
* numbers poles and groups them by size (7-2.5, 7-3, 7-4, 9-4).

A key rule: **every cable end and every loopback turning point becomes a FAT.** The pole at a cable end usually stands on the road, just outside the boundary drawn around the houses. The tool still makes it a FAT as long as it is reasonably close to the nearest boundary.

## 4. KML to Database HP
[KML to Database HP](/dashboard/kml-database-hp) builds the HPDB Excel **per FDT**: tray, FDT port, line, cable capacity, tube colour, core number, FAT, FAT port, FAT pole, and a geocoded address. Addresses are looked up **per FAT**, so houses on different streets and villages no longer share one address.

## 5. KML to BOQ
[KML to BOQ](/dashboard/kml-boq) fills the BoM/BoQ template: cable length per line and capacity, sling wire, FAT count, poles by type, and HP cover. Cables or FDTs that have no place in the template are **reported** instead of silently dropped.

## 6. KML to CAD
The newest tool, [KML to CAD](/dashboard/kml-cad), draws the design into an AutoCAD DXF based on the drafter template. FAT/FDT symbols get automatically placed callout boxes that never collide. Cables are drawn per core capacity, poles per type with their POLE ID, and the title block and **DESIGN SUMMARY** table fill themselves. The number of layouts follows the number of FDTs.

There are two choices:

| Option | Description |
| :--- | :--- |
| **Cluster** | APD design: FDT, FAT, boundary, distribution cable, poles, sling |
| **SF / HF / MF** | Feeder design: cable route, poles, joint closure, slack hanger |
| **With basic map** | Cluster: house blocks + OSM roads in one DXF. Feeder: road edges and names |
| **Without basic map** | Design only, faster |

## 7. Auto Coding APD
[Auto Coding APD](/dashboard/insert-coding) renames FDTs, FATs, cables, and new poles with your project codes. Enter a prefix for each FDT (FDT 01, FDT 02, ...); there is no limit on the number of FDTs.

## 8. Pole Auto-Sorter
Finally, [Pole Auto-Sorter](/dashboard/pole-sorter) renumbers poles **along the distribution cable starting from the FDT**, closing any gaps left after poles were deleted or moved.

## Preparing Files for a Smooth Run
Almost every automation problem starts with folder structure. A few habits keep all of the tools above running cleanly:
1. **One folder per LINE**, e.g. `LINE A FDT 01`. The FDT number in the folder name separates the counts per FDT.
2. **Standard folder names**: `BOUNDARY FAT`, `FAT`, `HP COVER`, `DISTRIBUTION CABLE`, `SLING WIRE`, `NEW POLE 7-3`, `EXISTING POLE EMR 7-4`.
3. **Capacity in the cable name**, e.g. `CABLE LINE A (FO 24C/2T)`, so the BOQ and CAD drawing use the right layer.
4. **Always read the result report.** Warnings such as "boundary without FAT" or "cable not in BOQ" are far cheaper to fix at the desk than in the field.

With this workflow, work that normally takes days can be done in hours, and every number in the BOQ, HP database, and CAD drawing comes from one single source of data.
