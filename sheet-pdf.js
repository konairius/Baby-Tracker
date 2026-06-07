/* Printable feeding tracking sheet (PDF).
 * Generates a single-page A4 PDF with no dependencies by emitting raw PDF
 * markup. All drawn text is ASCII so JS string length == UTF-8 byte length,
 * which keeps the xref byte offsets correct.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function buildContent() {
    const W = 595.28; // A4 width in points
    const H = 841.89; // A4 height in points
    const left = 40;
    const right = W - 40;
    const out = [];

    out.push("0 0 0 RG"); // stroke: black
    out.push("0 0 0 rg"); // fill: black
    out.push("1 w");

    function text(x, y, size, font, str) {
      out.push(
        "BT /" + font + " " + size + " Tf " +
          x.toFixed(2) + " " + y.toFixed(2) + " Td (" + esc(str) + ") Tj ET"
      );
    }
    function line(x1, y1, x2, y2) {
      out.push(
        x1.toFixed(2) + " " + y1.toFixed(2) + " m " +
          x2.toFixed(2) + " " + y2.toFixed(2) + " l S"
      );
    }

    // Title + fill-in header.
    text(left, H - 50, 18, "F2", "Baby Food Tracker - Feeding Sheet");
    text(
      left,
      H - 70,
      10,
      "F1",
      "Baby: ____________________________     Sheet date: ____________________"
    );

    // Table geometry.
    const cols = [left, 190, 280, 415, right]; // column boundaries x0..x4
    const headers = ["Date", "Time", "Provided (ml)", "Not consumed (ml)"];
    const yTop = H - 95;
    const headerH = 24;
    const rowH = 26;
    const bottomLimit = 55;
    const nRows = Math.floor((yTop - headerH - bottomLimit) / rowH);
    const tableBottom = yTop - headerH - nRows * rowH;

    // Horizontal rules: top, under header, and one per row.
    line(left, yTop, right, yTop);
    line(left, yTop - headerH, right, yTop - headerH);
    for (let i = 1; i <= nRows; i++) {
      const y = yTop - headerH - i * rowH;
      line(left, y, right, y);
    }
    // Vertical column separators.
    for (const x of cols) {
      line(x, yTop, x, tableBottom);
    }
    // Header labels.
    for (let i = 0; i < headers.length; i++) {
      text(cols[i] + 6, yTop - 16, 10, "F2", headers[i]);
    }

    text(
      left,
      38,
      8,
      "F1",
      "Fill rows by hand (amounts in ml). 'Consumed' is calculated in the app. " +
        "Then use Add a feeding > Import from photo."
    );

    return out.join("\n");
  }

  function generateTrackingSheetPdf() {
    const content = buildContent();

    const objs = [];
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objs.push(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] " +
        "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>"
    );
    objs.push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    let pdf = "%PDF-1.4\n";
    const offsets = [];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(pdf.length);
      pdf += i + 1 + " 0 obj\n" + objs[i] + "\nendobj\n";
    }

    const xrefStart = pdf.length;
    pdf += "xref\n0 " + (objs.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (const off of offsets) {
      pdf += String(off).padStart(10, "0") + " 00000 n \n";
    }
    pdf +=
      "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\n" +
      "startxref\n" + xrefStart + "\n%%EOF";

    return new Blob([pdf], { type: "application/pdf" });
  }

  window.generateTrackingSheetPdf = generateTrackingSheetPdf;
})();
