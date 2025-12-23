import React, { useState, useRef, useEffect } from 'react';
import { 
  Wand2, 
  Image as ImageIcon, 
  Table as TableIcon, 
  FileText, 
  Download, 
  Copy,
  UploadCloud,
  X,
  FileSpreadsheet,
  Sparkles,
  BookOpen,
  ChevronRight,
  Layers,
  Zap,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  List,
  CheckCircle2,
  FileType,
  FileBadge,
  Server,
  Network
} from 'lucide-react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import Button from './components/Button';
import TabButton from './components/TabButton';
import { AppMode, ExtractedTableData, ChapterType, MergerInputs, AIProvider } from './types';
import * as GeminiService from './services/geminiService';
import * as ExportService from './services/exportService';

// Set up PDF Worker
// Fix for pdfjs-dist import structure (handling esm.sh default export wrapper)
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

if (pdfjs.GlobalWorkerOptions) {
  // Use cdnjs for the worker as it is more reliable for worker loading than esm.sh in this context
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

function App() {
  // State
  const [mode, setMode] = useState<AppMode>(AppMode.TEXT_CLEANUP);
  const [chapterType, setChapterType] = useState<ChapterType>(ChapterType.BAB_1); 
  const [provider, setProvider] = useState<AIProvider>(AIProvider.GOOGLE); // Multi-Path State
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [tableData, setTableData] = useState<ExtractedTableData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null); // For PDF to Word mode
  
  // Preview Zoom State
  const [zoomLevel, setZoomLevel] = useState(0.45); // Default zoomed out to fit width roughly

  // Merger State (Strings hold HTML content derived from files)
  const [mergerInputs, setMergerInputs] = useState<MergerInputs>({
    cover: '', approval: '', preface: '', abstract: '',
    bab1: '', bab2: '', bab3: '', bab4: '', bab5: '', biblio: '',
    autoToc: true
  });
  // Track filenames for UI display
  const [mergerFilenames, setMergerFilenames] = useState<Record<string, string>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync editor content
  useEffect(() => {
    if ((mode === AppMode.ACADEMIC_PAPER || mode === AppMode.SKRIPSI_MERGER || mode === AppMode.PDF_TO_WORD) && editorRef.current && outputText && !isLoading) {
      if (editorRef.current.innerHTML !== outputText) {
         editorRef.current.innerHTML = outputText;
      }
    }
  }, [outputText, mode, isLoading]);

  // Reset states when changing modes
  const switchMode = (newMode: AppMode) => {
    setMode(newMode);
    setTableData(null);
    setOutputText('');
    setInputText('');
    setSelectedImage(null);
    setSelectedFile(null);
  };

  // Helper to read PDF
  const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    // Use the resolved pdfjs object
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullHtml = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      // Join strings with space
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      
      // Simple formatting: wrap in paragraph
      fullHtml += `<p>${pageText}</p><br>`; 
    }
    return fullHtml;
  };

  // Handlers
  const handleProcess = async () => {
    setIsLoading(true);
    setTableData(null);
    setLoadingStep("");

    try {
      if (mode === AppMode.TEXT_CLEANUP) {
        setOutputText(""); // Clear previous
        // Use Streaming for Cleanup Mode to make it feel instant
        const cleaned = await GeminiService.cleanupText(inputText, provider, (chunk) => {
          setOutputText((prev) => prev + chunk);
        });
        // Ensure final sync
        setOutputText(cleaned);

      } else if (mode === AppMode.ACADEMIC_PAPER) {
        
        if (chapterType === ChapterType.FULL_SKRIPSI_AUTO) {
          let fullDraft = "";
          const chapters = [
            { type: ChapterType.FULL_FRONT_MATTER, label: "Bagian Depan" },
            { type: ChapterType.BAB_1, label: "Bab I" },
            { type: ChapterType.BAB_2, label: "Bab II" },
            { type: ChapterType.BAB_3, label: "Bab III" },
            { type: ChapterType.BAB_4, label: "Bab IV" },
            { type: ChapterType.BAB_5, label: "Bab V" },
            { type: ChapterType.BIBLIOGRAPHY, label: "Daftar Pustaka" }
          ];

          for (const ch of chapters) {
            setLoadingStep(`Menulis ${ch.label} via ${provider}...`);
            await new Promise(r => setTimeout(r, 1000));
            const content = await GeminiService.generateChapter(ch.type, inputText, provider);
            
            if (fullDraft !== "") {
              fullDraft += `<br clear=all style='mso-special-character:line-break;page-break-before:always'>`;
            }
            fullDraft += content;
            setOutputText(fullDraft);
          }
          setLoadingStep("");

        } else {
          setLoadingStep(`Menghubungi ${provider}...`);
          const paperHtml = await GeminiService.generateChapter(chapterType, inputText, provider);
          setOutputText(paperHtml);
        }

      } else if (mode === AppMode.IMAGE_TO_TEXT && selectedImage) {
        // Image always uses Google for now
        const extracted = await GeminiService.extractTextFromImage(selectedImage);
        setOutputText(extracted);

      } else if (mode === AppMode.IMAGE_TO_TABLE && selectedImage) {
        // Image always uses Google for now
        const data = await GeminiService.extractTableFromImage(selectedImage);
        setTableData(data);
        const csvString = [data.headers.join(' | '), ...data.rows.map(row => row.join(' | '))].join('\n');
        setOutputText(csvString);

      } else if (mode === AppMode.PDF_TO_WORD && selectedFile) {
        setLoadingStep("Mengonversi PDF...");
        const arrayBuffer = await selectedFile.arrayBuffer();
        const html = await extractTextFromPdf(arrayBuffer);
        setOutputText(html);
      }

    } catch (error: any) {
      alert(error.message || "Terjadi kesalahan. Coba lagi.");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  /**
   * Helper function to extract headers from HTML string
   * Simple regex based extraction for h1-h4
   */
  const generateTocFromHtml = (fullHtml: string) => {
    // Create a temp element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, 'text/html');
    const headers = doc.querySelectorAll('h1, h2, h3');
    
    if (headers.length === 0) return "";

    let tocHtml = `<h3 style="text-align:center;">DAFTAR ISI</h3><br/>`;
    tocHtml += `<div style="font-family: 'Times New Roman';">`;
    
    headers.forEach((header) => {
      const level = parseInt(header.tagName.substring(1));
      const text = header.textContent || "";
      const indent = (level - 1) * 20; // Indent based on header level
      
      tocHtml += `<div style="margin-left: ${indent}px; margin-bottom: 5px; border-bottom: 1px dotted #ccc; display: flex; justify-content: space-between;">`;
      tocHtml += `<span>${text}</span><span>...</span>`; // Placeholder for page number
      tocHtml += `</div>`;
    });
    
    tocHtml += `</div><br clear=all style='mso-special-character:line-break;page-break-before:always'>`;
    return tocHtml;
  };

  const generateTableListFromHtml = (fullHtml: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, 'text/html');
    const tables = doc.querySelectorAll('table');
    
    if (tables.length === 0) return "";

    let listHtml = `<h3 style="text-align:center;">DAFTAR TABEL</h3><br/>`;
    listHtml += `<div style="font-family: 'Times New Roman';">`;
    
    tables.forEach((_, index) => {
      listHtml += `<div style="margin-bottom: 5px; border-bottom: 1px dotted #ccc; display: flex; justify-content: space-between;">`;
      listHtml += `<span>Tabel ${index + 1}. [Judul Tabel]</span><span>...</span>`; 
      listHtml += `</div>`;
    });
    
    listHtml += `</div><br clear=all style='mso-special-character:line-break;page-break-before:always'>`;
    return listHtml;
  };

  const handleMerge = () => {
    setIsLoading(true);
    setLoadingStep("Menggabungkan file...");

    // 1. Gather Content
    const bodyContentRaw = [
      mergerInputs.bab1,
      mergerInputs.bab2,
      mergerInputs.bab3,
      mergerInputs.bab4,
      mergerInputs.bab5
    ].join("");

    // 2. Generate Automated Lists if enabled
    let automatedLists = "";
    if (mergerInputs.autoToc) {
      if (bodyContentRaw) {
        setLoadingStep("Membuat Daftar Isi & Tabel Otomatis...");
        const toc = generateTocFromHtml(bodyContentRaw);
        const tableList = generateTableListFromHtml(bodyContentRaw);
        automatedLists = toc + tableList;
      }
    }

    // 3. Assemble Final Doc
    const parts = [
      mergerInputs.cover,
      mergerInputs.approval,
      mergerInputs.preface,
      mergerInputs.abstract,
      automatedLists, // Inserted here
      mergerInputs.bab1,
      mergerInputs.bab2,
      mergerInputs.bab3,
      mergerInputs.bab4,
      mergerInputs.bab5,
      mergerInputs.biblio
    ];

    const combined = parts
      .filter(p => p && p.trim().length > 0)
      .join("<br clear=all style='mso-special-character:line-break;page-break-before:always'><br>");

    if (!combined) {
      alert("Belum ada file yang diupload!");
    } else {
      setOutputText(combined);
      setZoomLevel(0.4);
    }
    setIsLoading(false);
    setLoadingStep("");
  };

  // File Upload Handler for Merger
  const handleChapterFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: keyof MergerInputs) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // BLOCK PDF for Merger Mode
    if (file.name.toLowerCase().endsWith('.pdf')) {
      alert("Mohon maaf, file PDF untuk Skripsi Merger saat ini TIDAK DIDUKUNG. Silahkan gunakan fitur 'PDF TO WORD' di menu atas untuk mengonversinya terlebih dahulu.");
      return;
    }

    setLoadingStep(`Membaca ${file.name}...`);
    setIsLoading(true);

    try {
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setMergerInputs(prev => ({ ...prev, [key]: result.value }));
        setMergerFilenames(prev => ({ ...prev, [key]: file.name }));
      } else {
        alert("Mohon upload file .docx");
      }
    } catch (err) {
      console.error(err);
      alert("Gagal membaca file. Pastikan file tidak rusak.");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const removeChapterFile = (key: keyof MergerInputs) => {
    setMergerInputs(prev => ({ ...prev, [key]: '' }));
    setMergerFilenames(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    } else {
      alert("Mohon upload file .PDF");
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyToClipboard = () => {
    if ((mode === AppMode.ACADEMIC_PAPER || mode === AppMode.SKRIPSI_MERGER || mode === AppMode.PDF_TO_WORD) && editorRef.current) {
       navigator.clipboard.writeText(editorRef.current.innerText);
    } else {
       navigator.clipboard.writeText(outputText);
    }
  };

  const getPlaceholderText = () => {
    if (mode === AppMode.TEXT_CLEANUP) return "Paste ugly AI text here...";
    if (mode === AppMode.ACADEMIC_PAPER) {
      if (chapterType === ChapterType.FULL_SKRIPSI_AUTO) {
        return "Masukkan SEMUA data penelitian kamu di sini secara lengkap (Judul, Fenomena, Data, Metode, Hasil Sementara)...";
      }
      if (chapterType === ChapterType.FULL_FRONT_MATTER) {
        return "Masukkan Data Lengkap Skripsi:\n1. Judul Skripsi\n2. Nama & NIM\n3. Nama Kampus, Fakultas, Prodi\n4. Nama Dosen Pembimbing (untuk pengesahan)\n5. Nama Orang Tua/Teman (untuk kata pengantar)\n6. Inti Sari Penelitian (untuk Abstrak)";
      }
      switch (chapterType) {
        case ChapterType.BAB_1: return "Masukkan: Fenomena, Masalah, Tujuan...";
        default: return "Masukkan materi disini...";
      }
    }
    return "";
  };

  const getButtonText = () => {
    if (isLoading && loadingStep) return loadingStep;
    if (mode === AppMode.TEXT_CLEANUP) return "Clean & Humanize Text";
    if (mode === AppMode.ACADEMIC_PAPER) {
      if (chapterType === ChapterType.FULL_SKRIPSI_AUTO) return "🚀 Generate FULL SKRIPSI";
      if (chapterType === ChapterType.FULL_FRONT_MATTER) return "Generate Bagian Depan Lengkap";
      return "Generate";
    }
    if (mode === AppMode.PDF_TO_WORD) return "Convert PDF to Word";
    return "Process Image";
  }

  // Helper for Merger UI inputs
  const renderMergerInput = (label: string, key: keyof MergerInputs) => (
    <div className="bg-gray-50 p-2 rounded-lg border border-gray-200">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide truncate">{label}</label>
        {mergerFilenames[key] && (
          <button onClick={() => removeChapterFile(key)} className="text-red-500 hover:text-red-700">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      
      {mergerFilenames[key] ? (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-2 py-1.5 rounded border border-blue-200">
          <FileText size={14} />
          <span className="truncate font-medium">{mergerFilenames[key]}</span>
        </div>
      ) : (
        <div className="relative group">
          <input 
            type="file" 
            accept=".docx"
            onChange={(e) => handleChapterFileUpload(e, key)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="flex items-center justify-center gap-2 w-full py-1.5 border border-dashed border-gray-300 rounded bg-white text-gray-400 text-xs font-medium group-hover:bg-blue-50 group-hover:border-blue-300 transition-colors">
            <UploadCloud size={12} />
            Browse (.docx)
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20 font-sans">
      
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Wand2 size={20} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500 hidden sm:block">
              FormatMaster AI
            </h1>
            <h1 className="text-xl font-bold text-blue-600 sm:hidden">FM AI</h1>
          </div>

          {/* AI PROVIDER DROPDOWN (MULTI-PATH ROUTER) */}
          <div className="flex items-center gap-2">
            <div className="relative hidden md:flex items-center gap-2 mr-2 text-xs text-gray-500 font-medium">
              <Network size={14} />
              <span>Jalur AI:</span>
            </div>
            <div className="relative">
              <select 
                value={provider}
                onChange={(e) => setProvider(e.target.value as AIProvider)}
                className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer shadow-sm hover:bg-slate-100 transition-colors"
              >
                <option value={AIProvider.GOOGLE}>Google Gemini (Auto Fallback)</option>
                <option value={AIProvider.GOOGLE_EXP}>Google Gemini Thinking (Reasoning)</option>
                <option value={AIProvider.GROQ}>Groq Cloud (Llama 3.3 70B)</option>
                <option value={AIProvider.OPENROUTER}>OpenRouter (Gemini Flash Exp Free)</option>
                <option value={AIProvider.TOGETHER}>Together AI (Llama 3.3 70B)</option>
                <option value={AIProvider.OLLAMA}>Ollama Local (Server Sendiri)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Mode Tabs */}
        <div className="bg-white rounded-xl shadow-sm border p-1 mb-6 flex flex-col sm:flex-row gap-1 overflow-x-auto">
          <TabButton 
            active={mode === AppMode.TEXT_CLEANUP} 
            onClick={() => switchMode(AppMode.TEXT_CLEANUP)}
            icon={<Sparkles size={18} />}
            label="Cleanup"
          />
          <TabButton 
            active={mode === AppMode.ACADEMIC_PAPER} 
            onClick={() => switchMode(AppMode.ACADEMIC_PAPER)}
            icon={<BookOpen size={18} />}
            label="Skripsi Maker (AI)"
          />
          <TabButton 
            active={mode === AppMode.SKRIPSI_MERGER} 
            onClick={() => switchMode(AppMode.SKRIPSI_MERGER)}
            icon={<Layers size={18} />}
            label="Skripsi Merger"
          />
          <TabButton 
            active={mode === AppMode.PDF_TO_WORD} 
            onClick={() => switchMode(AppMode.PDF_TO_WORD)}
            icon={<FileType size={18} />}
            label="PDF to Word"
          />
          <TabButton 
            active={mode === AppMode.IMAGE_TO_TEXT} 
            onClick={() => switchMode(AppMode.IMAGE_TO_TEXT)}
            icon={<ImageIcon size={18} />}
            label="Img to Text"
          />
          <TabButton 
            active={mode === AppMode.IMAGE_TO_TABLE} 
            onClick={() => switchMode(AppMode.IMAGE_TO_TABLE)}
            icon={<TableIcon size={18} />}
            label="Img to Excel"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* LEFT COLUMN: INPUT (Width 4/12) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border flex flex-col h-full max-h-[85vh] sticky top-24">
              
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  {mode === AppMode.SKRIPSI_MERGER ? '1. Upload Files (.docx)' : 
                   mode === AppMode.PDF_TO_WORD ? '1. Upload PDF File' :
                   (mode === AppMode.IMAGE_TO_TEXT || mode === AppMode.IMAGE_TO_TABLE ? '1. Upload Image' : '1. Input Content')}
                </h2>
              </div>

              {/* CHAPTER SELECTOR for Academic Mode */}
              {mode === AppMode.ACADEMIC_PAPER && (
                <div className="mb-4">
                  <div className="grid grid-cols-1 mb-2">
                    <button 
                      onClick={() => setChapterType(ChapterType.FULL_SKRIPSI_AUTO)}
                      className={`px-3 py-3 text-sm font-bold rounded-lg border text-left transition flex items-center justify-center gap-2 ${chapterType === ChapterType.FULL_SKRIPSI_AUTO ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'}`}
                    >
                      <Zap size={16} /> GENERATE ALL (Bab 1-5)
                    </button>
                  </div>
                  
                  {/* SPLIT FRONT MATTER BUTTONS - CHANGED TO SINGLE BUTTON */}
                  <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Bagian Depan</label>
                  <div className="mb-3">
                     <button 
                        onClick={() => setChapterType(ChapterType.FULL_FRONT_MATTER)}
                        className={`w-full px-3 py-3 text-sm font-bold rounded-lg border text-left transition flex items-center justify-center gap-2 ${chapterType === ChapterType.FULL_FRONT_MATTER ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                      >
                        <FileBadge size={16} /> Bagian Depan Lengkap (All-in-One)
                      </button>
                      <p className="text-[10px] text-gray-500 mt-1 text-center">Mencakup: Cover, Pengesahan, Kata Pengantar, Abstrak</p>
                  </div>

                  <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Isi Skripsi</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {type: ChapterType.BAB_1, label: "Bab I"},
                      {type: ChapterType.BAB_2, label: "Bab II"},
                      {type: ChapterType.BAB_3, label: "Bab III"},
                      {type: ChapterType.BAB_4, label: "Bab IV"},
                      {type: ChapterType.BAB_5, label: "Bab V"},
                      {type: ChapterType.BIBLIOGRAPHY, label: "Daftar Pustaka"}
                    ].map(ch => (
                      <button 
                        key={ch.type}
                        onClick={() => setChapterType(ch.type)}
                        className={`px-2 py-2 text-xs font-medium rounded border text-center transition ${chapterType === ch.type ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50 text-gray-600'}`}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* INPUT AREA LOGIC */}
              {mode === AppMode.SKRIPSI_MERGER ? (
                 <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                    
                    {/* Auto ToC Toggle */}
                    <div 
                      onClick={() => setMergerInputs(p => ({...p, autoToc: !p.autoToc}))}
                      className={`cursor-pointer p-3 rounded-lg border flex items-center gap-3 transition-colors ${mergerInputs.autoToc ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${mergerInputs.autoToc ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300'}`}>
                        {mergerInputs.autoToc && <CheckCircle2 size={14} />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                          <List size={14} /> Auto-Generate Lists
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Otomatis membuat Daftar Isi & Tabel dari file Bab 1-5.
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-gray-200 my-2"></div>

                    {renderMergerInput("1. Cover / Judul", "cover")}
                    {renderMergerInput("2. Lembar Pengesahan", "approval")}
                    {renderMergerInput("3. Kata Pengantar", "preface")}
                    {renderMergerInput("4. Abstrak", "abstract")}
                    
                    <div className="h-px bg-gray-200 my-2"></div>
                    
                    {renderMergerInput("5. Bab I Pendahuluan", "bab1")}
                    {renderMergerInput("6. Bab II Tinjauan Pustaka", "bab2")}
                    {renderMergerInput("7. Bab III Metode", "bab3")}
                    {renderMergerInput("8. Bab IV Hasil", "bab4")}
                    {renderMergerInput("9. Bab V Penutup", "bab5")}
                    {renderMergerInput("10. Daftar Pustaka", "biblio")}
                 </div>
              ) : (mode === AppMode.TEXT_CLEANUP || mode === AppMode.ACADEMIC_PAPER) ? (
                <div className="flex-1 flex flex-col relative">
                  <textarea
                    className="flex-1 w-full p-4 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-mono text-sm leading-relaxed"
                    placeholder={getPlaceholderText()}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-gray-400 pointer-events-none">
                    {inputText.length} chars
                  </div>
                </div>
              ) : mode === AppMode.PDF_TO_WORD ? (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors relative overflow-hidden group">
                  {selectedFile ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900/5 p-4 text-center">
                      <FileText size={48} className="text-red-500 mb-2" />
                      <p className="text-sm font-bold text-gray-700 truncate max-w-[200px]">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      <button 
                        onClick={clearFile}
                        className="absolute top-4 right-4 p-2 bg-white text-gray-700 hover:text-red-500 rounded-full shadow-md transition"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handlePdfUpload}
                        accept=".pdf"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                        <UploadCloud size={32} className="text-blue-500" />
                      </div>
                      <p className="text-gray-900 font-semibold text-lg">Upload PDF</p>
                      <p className="text-xs text-gray-500 mt-2">Click to browse your .pdf file</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors relative overflow-hidden group">
                  {selectedImage ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-gray-900/5 p-4">
                      <img src={selectedImage} alt="Upload" className="max-w-full max-h-full object-contain shadow-lg rounded" />
                      <button 
                        onClick={clearImage}
                        className="absolute top-4 right-4 p-2 bg-white text-gray-700 hover:text-red-500 rounded-full shadow-md transition"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                        <UploadCloud size={32} className="text-blue-500" />
                      </div>
                      <p className="text-gray-900 font-semibold text-lg">Click to Upload</p>
                    </>
                  )}
                </div>
              )}

              <div className="mt-4 pt-4 border-t">
                {mode === AppMode.SKRIPSI_MERGER ? (
                  <Button 
                    onClick={handleMerge} 
                    isLoading={isLoading} 
                    className="w-full h-12 text-base shadow-blue-200"
                    variant="secondary"
                  >
                     Gabungkan (.DOCX) <ChevronRight size={18} />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleProcess} 
                    isLoading={isLoading} 
                    className="w-full h-12 text-base shadow-blue-200"
                    disabled={
                      (mode === AppMode.TEXT_CLEANUP || mode === AppMode.ACADEMIC_PAPER) ? !inputText : 
                      (mode === AppMode.PDF_TO_WORD) ? !selectedFile : 
                      !selectedImage
                    }
                  >
                    {getButtonText()} {(!isLoading && !loadingStep) && <ChevronRight size={18} />}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: OUTPUT PREVIEW (Width 8/12) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="bg-white rounded-xl shadow-sm border flex flex-col relative h-[85vh]">
              
              {/* Preview Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-xl">
                <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  2. Preview & Download
                </h2>
                
                {(mode === AppMode.ACADEMIC_PAPER || mode === AppMode.SKRIPSI_MERGER || mode === AppMode.PDF_TO_WORD) && (
                  <div className="flex items-center gap-2 bg-white rounded-lg border p-1 shadow-sm">
                    <button onClick={() => setZoomLevel(z => Math.max(0.2, z - 0.1))} className="p-1 hover:bg-gray-100 rounded text-gray-600" title="Zoom Out">
                      <ZoomOut size={16} />
                    </button>
                    <span className="text-xs font-mono w-12 text-center text-gray-600">{Math.round(zoomLevel * 100)}%</span>
                    <button onClick={() => setZoomLevel(z => Math.min(1.5, z + 0.1))} className="p-1 hover:bg-gray-100 rounded text-gray-600" title="Zoom In">
                      <ZoomIn size={16} />
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={copyToClipboard} className="p-1 hover:bg-gray-100 rounded text-gray-600 flex gap-1 items-center text-xs font-medium" title="Copy Text">
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                )}
              </div>

              {/* PREVIEW VIEWPORT */}
              <div className="flex-1 bg-gray-500/10 overflow-auto relative p-8 flex justify-center items-start">
                
                {tableData ? (
                  // TABLE VIEW
                  <div className="w-full h-full bg-white rounded-lg shadow overflow-auto">
                     <table className="w-full text-sm text-left text-gray-600">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-200 sticky top-0">
                        <tr>
                          {tableData.headers.map((header, i) => (
                            <th key={i} className="px-6 py-3 border-b border-gray-300 font-bold">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row, i) => (
                          <tr key={i} className="bg-white border-b hover:bg-blue-50 transition-colors">
                            {row.map((cell, j) => (
                              <td key={j} className="px-6 py-4 truncate max-w-xs border-r last:border-r-0" title={cell}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (mode === AppMode.ACADEMIC_PAPER || mode === AppMode.SKRIPSI_MERGER || mode === AppMode.PDF_TO_WORD) ? (
                  // PAPER PREVIEW (SCALABLE A4)
                  <div 
                    style={{ 
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.2s ease-out'
                    }}
                  >
                    <div 
                      ref={editorRef}
                      className="bg-white shadow-2xl focus:outline-none"
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setOutputText(e.currentTarget.innerHTML)}
                      style={{ 
                        width: '21cm',        // A4 Width
                        minHeight: '29.7cm',  // A4 Height
                        padding: '4cm 3cm 3cm 4cm', // 4-4-3-3 Margin
                        fontFamily: "'Times New Roman', Times, serif", 
                        fontSize: '12pt',
                        lineHeight: '2.0', 
                        color: '#000',
                        textAlign: 'justify'
                      }}
                    >
                      {!outputText && (
                        <div className="h-[20cm] flex flex-col items-center justify-center opacity-40 font-sans p-10 select-none pointer-events-none">
                          <BookOpen size={64} className="mb-4 text-gray-300" />
                          <span className="text-center text-xl text-gray-400 font-light">Preview Dokumen<br/>akan muncul di sini</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // STANDARD TEXT AREA (Cleanup Mode)
                  <textarea
                    className="w-full h-full p-8 bg-white shadow-lg focus:outline-none resize-none font-sans text-base leading-relaxed text-gray-700 max-w-3xl rounded-lg"
                    placeholder="Output will appear here..."
                    value={outputText}
                    onChange={(e) => setOutputText(e.target.value)}
                  />
                )}
              </div>

              {/* BOTTOM ACTIONS BAR */}
              <div className="p-4 bg-white border-t rounded-b-xl flex gap-3 z-10">
                {tableData ? (
                   <Button 
                    onClick={() => ExportService.exportToExcel(tableData)}
                    variant="secondary"
                    icon={<FileSpreadsheet size={18} />}
                    className="flex-1"
                  >
                    Download .XLSX
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={() => ExportService.exportToWord(outputText)}
                      variant="primary"
                      icon={<FileText size={18} />}
                      disabled={!outputText}
                      className="flex-1"
                    >
                      Download .DOCX (Word)
                    </Button>
                    <Button 
                      onClick={() => ExportService.exportToPDF(outputText)}
                      variant="outline"
                      icon={<Download size={18} />}
                      disabled={!outputText}
                      className="flex-1"
                    >
                      Download PDF
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;