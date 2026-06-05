---
title: "How to read OTDR traces like a senior engineer"
excerpt: "Decode events, splices, and reflectance values from OTDR outputs."
category: "OTDR Guide"
readTime: "8 min"
date: "May 4, 2026"
---

Optical Time-Domain Reflectometers (OTDRs) are essential troubleshooting instruments for fiber optic networks. However, to the untrained eye, an OTDR trace looks like a random series of spikes and slopes. 

In this tutorial, we will decode the physics behind OTDR traces and learn how to identify common fiber events.

## What is an OTDR Trace?
An OTDR sends high-power light pulses down a fiber and measures the light that is reflected or backscattered. By plotting this returned light over time, the OTDR generates a trace representing signal loss over distance.

The vertical axis represents **optical level (dB)**, and the horizontal axis represents **distance (km or meters)**.

## Key Events on an OTDR Trace

There are two primary categories of events on a trace: **Reflective** and **Non-Reflective**.

### 1. Reflective Events (Spikes)
A reflective event appears as a upward spike followed by a drop. These are caused by sudden changes in the refractive index, typically glass-to-air interfaces.
* **Connectors / Patches**: Every connection point (like SC/APC or LC/UPC) will produce a sharp reflective peak.
* **Mechanical Splices**: Sometimes show a small reflective spike.
* **Fiber End**: A massive spike followed by a complete drop to the noise floor indicates the physical end of the fiber (or a complete break).

### 2. Non-Reflective Events (Steps)
A non-reflective event appears as a clean step down in the trace line without any upward spike. These are caused by absorption or scattering.
* **Fusion Splices**: A small, clean step down (usually less than 0.05 dB).
* **Macrobends**: If a fiber is bent too sharply, light leaks out. This creates a step down. A macrobend can be diagnosed by testing at two different wavelengths (e.g., 1310 nm and 1550 nm); loss is typically much higher at 1550 nm.

```
Reflective Event (Connector)      Non-Reflective Event (Splice)
     _/\_
    /    \                               ________
___/      \________                     |
                   \______   =>  _______|
                          \             \________
```

## Step-by-Step Trace Analysis Checklist
1. **Identify the Launch Fiber**: Ensure you are looking past the OTDR launch cable (usually 500m to 1km used to bypass the OTDR's initial dead zone).
2. **Measure Cumulative Loss**: Note the slope of the line. A normal single-mode fiber should lose about 0.35 dB/km at 1310nm and 0.20 dB/km at 1550nm. A steeper slope indicates poor fiber quality.
3. **Analyze Events**: Look at each step and spike. Check if their loss values meet standard thresholds (e.g., fusion splice loss < 0.1 dB).

Need to analyze and document your field trace measurements? Upload your Telcordia `.sor` records directly to our [OTDR Trace Analyzer](/dashboard/otdr-analyzer) to view trace charts, review connection event tables, and print professional PDF acceptance reports.
