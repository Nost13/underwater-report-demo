# Section 1–4 template contract

- **Reference:** `C:\업무4\보고서5\UWS_Report_Generator_v118_summary_sample_page_reference_fix1\section1_4_template.docx`
- **SHA-256:** `27bc85fb54e9d27e2d7a65b933028f4ec7b82e2a3f1db34a3f29cdba7186c37a`
- **Page system:** A4 portrait (8.27 × 11.69 in), 0.5 in document margins. The template owns its fonts, styles, header, footer, and page-number fields.
- **Preserve-only parts:** `word/styles.xml`, `word/fontTable.xml`, `word/theme/theme1.xml`, all media parts, `word/footer1.xml`, and the template's section/header relationships except for the two header value strings below.

## Editable slots

| OOXML part / stable locator | Content |
| --- | --- |
| `word/document.xml`, table headed `VESSEL NAME`, value rows | Vessel name, IMO, call sign, vessel dimensions/type, owner/client, job number |
| `word/document.xml`, table headed `VESSEL SCHEDULE`, value rows | Schedule, operation record, vessel/site, personnel |
| `word/document.xml`, table headed `SERVICE CATEGORY`, data rows | Selected service category, description, scope basis |
| `word/document.xml`, table headed `TOOLBOX MEETING & LOTO` | Toolbox time and notes |
| `word/document.xml`, table headed `PREPARATION ON SITE` | Preparation time and notes |
| `word/header2.xml`, paragraphs starting `Job No : ` and `Vessel : ` | Job number and vessel name |

## Required retention

No editable text markers or granular content controls exist. Replace text in place and retain the original run properties. Do not rewrite page furniture or footer text. Rows beyond the number of selected services must be blank rather than copied from the example.

