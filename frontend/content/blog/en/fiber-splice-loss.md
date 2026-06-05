---
title: "Understanding fiber splice loss and how to minimize it"
excerpt: "Mechanical vs fusion, cleave quality, and acceptable thresholds."
category: "Fiber Engineering"
readTime: "5 min"
date: "Mar 30, 2026"
image: "/blog/fiber-splice-loss.png"
cta: "splice-manager"
---

Fusion splicing is the process of joining two optical fibers end-to-end using an electric arc. The goal is to fuse the fibers together so that light passing through them is not scattered or reflected back. 

However, every splice introduces a small amount of loss (attenuation). Let's explore how splice loss occurs and how to keep it within acceptable limits.

## 1. What is Acceptable Splice Loss?
In single-mode fiber networks, the industry standard for maximum splice loss is typically:
* **Standard Threshold**: **0.1 dB** per splice.
* **Telecom Target**: **0.05 dB** or lower (which is highly achievable with modern core-alignment fusion splicers).

If a splice exceeds 0.1 dB, it should be cut and spliced again.

## 2. Common Causes of High Splice Loss
High splice loss is usually caused by one of three issues:

### A. Poor Cleave Quality
The fiber cleaver cuts the glass fiber before splicing. If the cleave angle is too steep (greater than 1 degree) or has chips/lip defects, the fibers will not fuse cleanly.
* **Solution**: Clean the cleaver blade regularly and replace/rotate the blade after it becomes dull.

### B. Contamination
Any dust, moisture, or grease on the fiber core will be burned into the glass during the electric arc, creating a high-loss barrier.
* **Solution**: Always strip and clean the fiber *before* placing it in the cleaver. Once cleaved, never clean it again (as wipes can leave lint on the cleaved end).

### C. Fiber Core Mismatch
If you are splicing fibers from different manufacturers or different types (e.g. G.652.D standard single-mode to G.657.A1 bend-insensitive single-mode), there may be a slight mismatch in Mode Field Diameter (MFD).
* **Solution**: Use a **Core-Alignment** fusion splicer rather than a Clad-Alignment splicer. Core-alignment systems automatically adjust the position of the fiber cores to minimize offset before fusing.

---

Working on fiber splicing in the field? Use our interactive [Fiber Color Code Finder](/dashboard/fiber-color-code) to instantly lookup the exact tube and core color mappings for any fiber number under TIA-598-C or Telkom Indonesia standards.
