import {
  DataRef,
  dataRefToBuffer,
  dataRefToDownloadLink,
  InputsRefs,
} from "/@shared/client";
import { saveAs } from "file-saver";
import JSZip from "jszip";

export const downloadFile = async (name: string, ref: DataRef) => {
  // use dataRefToBuffer?
  const url = await dataRefToDownloadLink(ref);
  // Create a new link element
  const link = document.createElement("a");
  link.href = url;
  link.download = name;

  // Set the link text content for display purposes (optional)
  link.textContent = `Download ${name}`;

  // Append the link to the body (or another container)
  document.body.appendChild(link);

  // Trigger a click on the link to download the file
  link.click();

  // Clean up the URL object after the download
  URL.revokeObjectURL(url);
  document.body.removeChild(link);
};

export const zipAndDownloadDatarefs = async (
  refs: InputsRefs,
  name: string,
) => {
  const blobs: { blob: Blob; name: string }[] = [];
  for (const [name, ref] of Object.entries(refs)) {
    const buffer = await dataRefToBuffer(ref);
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    blobs.push({ blob, name });
  }
  zipAndDownloadBlobs(name, blobs);
};

export const zipAndDownloadBlobs = (
  name: string,
  blobs: { blob: Blob; name: string }[],
) => {
  const zip = new JSZip();

  // Add blobs to zip
  blobs.forEach((blobObj, index) => {
    zip.file(blobObj.name || `file${index + 1}`, blobObj.blob);
  });

  // Generate zip file and trigger download
  zip.generateAsync({ type: "blob" }).then(function (content) {
    // Use FileSaver to save the generated zip
    saveAs(content, `${name}-downloaded-files.zip`);
  });
};
