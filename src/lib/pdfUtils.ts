import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export async function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false
  });
  
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  pdf.save(`${filename}.pdf`);
}

export async function exportMultipleToPDF(elementClass: string, filename: string, onProgress?: (msg: string) => void) {
  const elements = document.getElementsByClassName(elementClass);
  if (!elements || elements.length === 0) return;

  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();

  for (let i = 0; i < elements.length; i++) {
    if (onProgress) onProgress(`Gerando página ${i + 1} de ${elements.length}...`);
    const element = elements[i] as HTMLElement;
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false
    });
    
    const imgData = canvas.toDataURL("image/png");
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  }

  if (onProgress) onProgress("Salvando PDF...");
  pdf.save(`${filename}.pdf`);
}
