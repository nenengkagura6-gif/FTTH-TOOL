---
title: "Generating accurate BOQs straight from KML files"
excerpt: "Avoid manual quantity errors and standardize your BOQ pipeline."
category: "Fiber Engineering"
readTime: "9 min"
date: "Apr 6, 2026"
---

A Bill of Quantities (BOQ) is one of the most critical deliverables in any fiber engineering project. It dictates the budget, material orders, and subcontractor payouts. Yet, many planning teams still compile BOQs by manually counting circles and measuring lines on Google Earth.

Here is a step-by-step guide on how to build an automated, error-free BOQ pipeline straight from your KML files.

## The Problem with Manual BOQ Compilation
Manual counting leads to several critical issues:
* **Human Error**: Missing a single 24-core cable route can cause a supply shortage mid-deployment.
* **Wasted Time**: A planner can spend hours measuring individual segments in Google Earth.
* **Inconsistency**: Different planners use different measurement margins or naming formats.

## Setting Up Your KML File for Automation
To auto-generate a BOQ, your KML must contain clear, standardized markers. Ensure that:
1. **Cables are Path elements** (Placemarks with `<LineString>`).
2. **Poles and closures are Point elements** (Placemarks with `<Point>`).
3. The names or descriptions of elements contain keywords that define their specifications (e.g., `CABLE-AERIAL-24C`, `POLE-9M-CONCRETE`).

## Generating the BOQ in Seconds
Once you have your clean KML file, you don't need to write complex scripts or parse the raw XML yourself. 

We have built a dedicated **KML to BOQ Tool** directly into this website to handle this exact workflow:

1. Navigate to the [KML to BOQ page](/dashboard/kml-boq).
2. Upload your `.kml` or `.kmz` file.
3. Upload your standard Excel template (containing your price lists or material codes).
4. Click **Process** and download your compiled Excel BOQ.

The tool automatically detects:
* Total cable lengths (adding custom slack factor percentages).
* Total pole counts by type.
* Total splitter and termination box quantities.

By automating this process, engineering firms save average of **12 hours of planning time per project** and virtually eliminate human estimation errors.
