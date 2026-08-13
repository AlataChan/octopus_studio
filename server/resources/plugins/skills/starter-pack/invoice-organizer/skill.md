---
name: Invoice/Receipt Organizer (Field Extraction/List)
description: Extract key fields from invoice and receipt files and summarize them into a list: title, tax ID, amount, date, purpose, reimbursement status, and more.
version: 1.0.0
author: Alata Studio
category: productivity
tags:
  - invoice
  - receipt
  - extraction
  - checklist
icon: 🧾
tools:
  - structured-output
  - read-file
  - list-files
---

# Invoice/Receipt Organizer (Field Extraction/List)

This skill is for reimbursement and reconciliation scenarios, turning a pile of documents into a structured checklist that can be verified.
You provide a directory containing invoice/receipt files or a single file, and I first read them and group them by type, such as VAT invoices or electronic receipts.
Then I extract key fields: issue date, merchant name, amount (tax-inclusive and tax-exclusive), tax rate, invoice number, buyer information, and remarks.
If you provide company reimbursement rules, I also mark potentially non-compliant items, such as inconsistent titles, missing tax IDs, abnormal amounts, or duplicate documents.
The output can be pasted directly into a spreadsheet or used as an attachment checklist for finance review.

## Example Output Formats

- Detail rows, one row per document
- Summary by month, project, or expense category
- List of materials that still need to be provided
