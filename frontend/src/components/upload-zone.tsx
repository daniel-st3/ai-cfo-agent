"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, FileSpreadsheet, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPTED = {
  "text/csv":                    [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel":    [".xls"],
  "application/pdf":             [".pdf"],
};

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isPdf = ext === "pdf";
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
      {isPdf
        ? <FileText className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
        : <FileSpreadsheet className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
      <span className="max-w-[120px] truncate">{file.name}</span>
      <span className="text-gray-400 text-[10px]">{(file.size / 1024).toFixed(0)} KB</span>
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function UploadZone({ onFiles, disabled }: Props) {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    const merged = [...files, ...accepted];
    const deduped = merged.filter((f, i, arr) => arr.findIndex(x => x.name === f.name) === i).slice(0, 5);
    setFiles(deduped);
    onFiles(deduped);
  }, [files, onFiles]);

  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    onFiles(next);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 5,
    multiple: true,
    disabled,
  });

  const hasFiles = files.length > 0;

  return (
    <div
      {...getRootProps()}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer",
        isDragActive && "border-blue-400 bg-blue-50 scale-[1.01]",
        !isDragActive && !hasFiles && "border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-gray-50",
        hasFiles && "border-green-300 bg-green-50/60",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input {...getInputProps()} />

      {hasFiles ? (
        <div className="flex flex-col items-center gap-3 w-full animate-fade-in-up">
          <div className="flex flex-wrap justify-center gap-2 max-w-full">
            {files.map((f, i) => (
              <FileChip key={f.name} file={f} onRemove={() => removeFile(i)} />
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            {files.length} file{files.length !== 1 ? "s" : ""} ready · click or drop to add more (max 5)
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm transition-all", isDragActive && "border-blue-300 bg-blue-50 scale-110")}>
            <Upload className={cn("h-5 w-5 transition-colors", isDragActive ? "text-blue-500" : "text-gray-400 group-hover:text-gray-600")} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              {isDragActive ? "Drop to analyze" : "Drop your financials here"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              CSV, Excel (.xlsx), or PDF · up to 5 files
            </p>
          </div>
          <div className="flex gap-2 text-[10px] uppercase tracking-widest text-gray-400">
            <span className="rounded-lg border border-gray-200 bg-white px-2 py-0.5">.csv</span>
            <span className="rounded-lg border border-gray-200 bg-white px-2 py-0.5">.xlsx</span>
            <span className="rounded-lg border border-gray-200 bg-white px-2 py-0.5">.pdf</span>
          </div>
        </div>
      )}
    </div>
  );
}
