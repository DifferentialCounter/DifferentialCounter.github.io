# Differential Counter — Decision Support References

This repository contains the Combined Cell Counter web app used for aspirate and peripheral blood smear counting. In addition to counting functionality, the app now includes a lightweight in-browser rule engine (scripts/rules.js) that provides non-diagnostic, advisory flags based on simple cell-count thresholds (blasts, M:E ratio, plasma cells, lymphocytes/atypical cells).

Important: these flags are decision support only and are not a diagnosis. Always confirm any flagged result with a qualified pathologist/clinician and appropriate confirmatory testing.

## Where to configure rule thresholds

Default thresholds are defined in `scripts/rules.js` (top of the file in the `defaults` object). They can be adjusted to match local laboratory policies and clinical practice.

Key defaults included in this release:
- blasts_high_pct: 20 (red flag — urgent review suggested)
- blasts_moderate_pct: 5 (orange flag — concerning)
- me_low / me_high: 1.5 – 3.3 (reference bounds for M:E ratio)
- plasma_myeloma_pct: 60 (red flag — consensus biomarker threshold used in myeloma guidance)
- plasma_suspicious_pct: 10 (orange flag — suspicious, consider further workup)
- lymph_high_pct: 50 and atypical_suspicious_count: 5 (lymphoma/marrow involvement heuristics)

These values are intentionally conservative and configurable. They are intended to prompt review and confirmatory testing, not to make any clinical decisions on their own.

## Recommended confirmatory tests (advisory)
When the app raises flags, recommended follow-up tests (as appropriate for the clinical context) include:

- Bone marrow trephine biopsy with histology and immunohistochemistry (e.g., CD20, CD3, CD138, kappa/lambda)
- Flow cytometry immunophenotyping (clonality, lineage assignment)
- Serum and urine protein electrophoresis (SPEP/UPEP), immunofixation, and serum free light chains (for plasma cell disorders)
- Molecular testing / targeted panels where indicated
- Cross-sectional or functional imaging (PET-CT, MRI) for focal lesions in plasma cell myeloma

Always correlate with clinical information, laboratory studies, and institutional protocols.

## Implementation notes
- The rule engine is implemented as a small, client-side evaluator and renderer at `scripts/rules.js`. It consumes a snapshot object containing `cellCounts`, `total`, `meRatio`, and optional `context` (`'aspirate'` or `'pb'`).
- Flags are rendered into `<div>` panels in each counter UI (e.g., `#aspirateFlags`, `#pbFlags`). The UI shows an advisory header and is dismissible per snapshot.
- Exporting to XLSX is disabled in the browser in this release (safe no-op) to avoid accidental client-side downloads. That can be re-enabled by restoring the XLSX/FileSaver includes in `index.html` and the exporter logic in the counter scripts.

## References and guidance (authoritative sources)
The following organizations and guideline resources informed the thresholds and recommended confirmatory testing. These references are provided for convenience and are not exhaustive — consult full guideline documents for complete diagnostic criteria and clinical decision-making.

- International Myeloma Working Group (IMWG) — diagnostic criteria and consensus guidance for plasma cell neoplasms / multiple myeloma
  - Main site: https://www.myeloma.org
  - IMWG publications and criteria: consult IMWG guidance documents and position statements available from professional sites and journals.

- World Health Organization (WHO) — Classification of Tumours of Haematolymphoid Tissues
  - WHO/IARC resources: https://www.iarc.who.int and WHO publications pages. For hematolymphoid tumour classification see the WHO Blue Books series.
  - WHO pages: https://www.who.int

- College of American Pathologists (CAP) — laboratory and reporting standards; recommendations for testing workflows
  - https://www.cap.org

- American Society of Hematology (ASH) — clinical and laboratory guidance for hematologic malignancies
  - https://www.hematology.org

- National Comprehensive Cancer Network (NCCN) — disease-specific guidelines and clinical pathways (access may require registration)
  - https://www.nccn.org

## Wording and governance
- The app intentionally uses non-diagnostic phrasing in flags (e.g., "may indicate", "consider evaluation", "recommend review"). The app is not intended to replace clinical judgment or standard diagnostic workflows.
- Local laboratories and clinical services should review and approve any thresholds and messages before using the flags in routine practice.

## Contact / Review
If you are a hematopathologist or lab director and would like to propose different thresholds, wording, or additional rules, please open an issue or submit a pull request with suggested changes and references.

---

Maintainer: DifferentialCounter (https://github.com/DifferentialCounter/DifferentialCounter.github.io)
