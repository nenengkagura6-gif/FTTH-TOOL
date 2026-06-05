---
title: "Complete guide to designing modern FTTH networks"
excerpt: "From last-mile planning to splitter ratios, learn how to architect FTTH networks that scale."
category: "FTTH Tutorials"
readTime: "12 min"
date: "May 8, 2026"
featured: true
---

FTTH (Fiber to the Home) networks form the backbone of modern gigabit internet delivery. Designing an FTTH network requires a delicate balance of physical constraints, optical power budgets, and future scalability. In this guide, we will walk through the core engineering steps required to design a robust FTTH network from scratch.

## 1. Understanding FTTH Topology
Most modern FTTH deployments utilize a **Passive Optical Network (PON)** architecture. PON is "passive" because it uses unpowered optical splitters to share a single fiber feed among multiple users (typically 32 to 128 homepasses per OLT port).

The physical network is divided into three main segments:
1. **Feeder Network**: Connects the central office (OLT - Optical Line Terminal) to the FDC (Fiber Distribution Center) or ODC (Optical Distribution Cabinet).
2. **Distribution Network**: Spans from the FDC to the FAT (Fiber Access Terminal) or ODP (Optical Distribution Point) near the homes.
3. **Drop/Access Network**: The final connection from the FAT to the customer's ONT (Optical Network Terminal) inside their home.

```
[OLT (Central)] === Feeder ===> [FDC Cabinet] === Distribution ===> [FAT Box] --- Drop ---=> [ONT (Home)]
```

## 2. Choosing Splitter Ratios and Placement
Splitting can be centralized in a single cabinet or distributed across the network in stages (cascaded splitting).

* **Centralized Splitting (1:32 or 1:64)**:
  * All splitters are placed in a central cabinet (FDC).
  * Easy to troubleshoot and maintain.
  * Higher distribution cable costs because separate fibers must run to each FAT.
* **Cascaded Splitting (e.g., 1:4 followed by 1:8)**:
  * First-stage splitter (1:4) is placed at a distribution node.
  * Second-stage splitters (1:8) are located inside the FATs.
  * Significantly reduces cable usage, but troubleshooting splitters in the field is more complex.

### Optical Link Budget
You must calculate the total optical attenuation (loss) to ensure the signal arriving at the ONT falls within the receiver's sensitivity window (typically between -8 dBm and -27 dBm).

| Component | Standard Loss |
| :--- | :--- |
| **Fiber Attenuation (1310 / 1490 nm)** | ~0.35 dB / km |
| **1:8 Splitter** | ~10.5 dB |
| **1:32 Splitter** | ~16.5 dB |
| **Fusion Splice** | ~0.05 - 0.1 dB |
| **Connector Pair** | ~0.25 - 0.5 dB |

Ensure you leave a **safety margin** of at least 2.0 to 3.0 dB for future degradation or fiber repairs (repair splices).

## 3. Creating the GIS Mapping Layout
Before laying fiber, you must create a geographic model of your layout. Engineers typically use tools like AutoCAD or Google Earth (KML/KMZ) to outline:
* **Poles / Underground Ducts**: The pathway for cables.
* **Cabinets / Closures**: Locations of FDCs and FATs.
* **Homepasses (HP)**: Targeted customer homes.

### How to Streamline the Mapping Workflow
Manually counting poles, cable lengths, and homepasses to build a Bill of Quantities (BOQ) is tedious and prone to human error. To automate this, you can use our built-in tools:
* Use the [KML to BOQ Tool](/dashboard/kml-boq) to immediately convert your Google Earth designs into a full Excel BOQ.
* Check for duplicate points in your files using the [KML Duplicate Checker](/dashboard/kml-checker) to avoid over-ordering materials.

---
*Stay tuned for Part 2 where we will cover optical budget calculation sheets in Excel.*
