"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, FileSpreadsheet, Upload, X, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const ACCEPTED = {
  "text/csv":                    [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel":    [".xls"],
  "application/pdf":             [".pdf"],
};

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-8 w-8 text-red-400" />;
  return <FileSpreadsheet className="h-8 w-8 text-green-400" />;
}

export function UploadZone({ onFile, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      onFile(accepted[0]);
    }
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled,
  });

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
  };

  return (
    <div
      {...getRootProps()}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer",
        isDragActive && "border-blue-400 bg-blue-50 scale-[1.01]",
        !isDragActive && !file && "border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-gray-50",
        file && "border-green-300 bg-green-50 cursor-default",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input {...getInputProps()} />

      {file ? (
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="relative">
            <FileIcon name={file.name} />
            <CheckCircle className="absolute -bottom-1 -right-1 h-4 w-4 text-green-500 bg-white rounded-full" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{file.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={clear} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest">
            <X className="h-3 w-3" /> Remove
          </button>
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
              CSV, Excel (.xlsx), or PDF · Balance sheets, P&amp;L, bank exports
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
