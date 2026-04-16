import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  FileText, 
  Camera, 
  BarChart3, 
  BookOpen, 
  LogOut, 
  Download, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  User as UserIcon,
  School,
  Clock,
  Calendar
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { correctExamFromImage, generateStudyGuide } from './services/aiService';
import { exportToPDF, exportMultipleToPDF } from './lib/pdfUtils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// Types
interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer: string;
}

interface Exam {
  id: string;
  title: string;
  subject: string;
  examType: 'PII' | 'PIII';
  examDate?: string;
  examTime?: string;
  classYear?: string;
  content?: string;
  questions: Question[];
  answerKey: Record<string, string>;
  studyGuide: string;
  professorId: string;
  createdAt: any;
}

interface Result {
  id: string;
  examId: string;
  studentName: string;
  score: number;
  maxScore: number;
  feedback: string;
  correctedAt: any;
}

const STUDENTS_DB: Record<string, { classId: string, name: string }[]> = {
  '6º ano': [
    { classId: '6º A', name: 'Alice Silva' },
    { classId: '6º A', name: 'Arthur Santos' },
    { classId: '6º A', name: 'Beatriz Costa' },
    { classId: '6º A', name: 'Bernardo Oliveira' },
    { classId: '6º B', name: 'Camila Pereira' },
    { classId: '6º B', name: 'Cauã Rodrigues' },
    { classId: '6º B', name: 'Davi Mendes' },
    { classId: '6º C', name: 'Eduarda Alves' },
    { classId: '6º C', name: 'Enzo Gabriel' },
  ],
  '7º ano': [
    { classId: '7º A', name: 'Felipe Rocha' },
    { classId: '7º A', name: 'Fernanda Lima' },
    { classId: '7º A', name: 'Gabriel Martins' },
    { classId: '7º B', name: 'Giovanna Souza' },
    { classId: '7º B', name: 'Heitor Ferreira' },
    { classId: '7º B', name: 'Heloísa Gomes' },
  ],
  '8º ano': [
    { classId: '8º A', name: 'Isabella Dias' },
    { classId: '8º A', name: 'Isaac Ribeiro' },
    { classId: '8º B', name: 'Júlia Azevedo' },
    { classId: '8º B', name: 'João Miguel' },
  ],
  '9º ano': [
    { classId: '9º A', name: 'Pedro Almeida' },
    { classId: '9º A', name: 'Laura Carvalho' },
    { classId: '9º B', name: 'Lucas Castro' },
    { classId: '9º B', name: 'Sofia Mendes' },
  ]
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'create' | 'correct' | 'reports' | 'guides' | 'admin' | 'schedule' | 'print'>('dashboard');
  const [selectedPrintExam, setSelectedPrintExam] = useState<Exam | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUser = async (currentUser: User | null) => {
    if (currentUser) {
      try {
        const { data: profile, error } = await supabase.from('users').select('*').eq('uid', currentUser.id).single();
        
        if (error && error.code === 'PGRST116') { // Not found
          const isDefaultAdmin = currentUser.email === 'cps@cps.local';
          await supabase.from('users').insert({
            uid: currentUser.id,
            email: currentUser.email,
            displayName: currentUser.user_metadata?.displayName || currentUser.email?.split('@')[0],
            role: isDefaultAdmin ? 'admin' : 'professor',
            schoolName: 'Colégio Progresso Santista'
          });
          setIsAdmin(isDefaultAdmin);
        } else if (profile) {
          setIsAdmin(profile.role === 'admin' || currentUser.email === 'cps@cps.local');
        }
        setUser(currentUser);
      } catch (err) {
        console.error("Error checking user role:", err);
        await supabase.auth.signOut();
        setUser(null);
        setError("Erro ao carregar perfil.");
      }
    } else {
      setUser(null);
      setIsAdmin(false);
    }
    setLoading(false);
  };

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const fetchExams = async () => {
      const { data } = await supabase.from('exams').select('*').eq('professorId', user.id).order('createdAt', { ascending: false });
      if (data) {
        setExams(data.map(exam => {
          const meta = exam.answerKey?._metadata || {};
          return {
            ...exam,
            classYear: exam.classYear || meta.classYear,
            content: exam.content || meta.content,
            examType: exam.examType || meta.examType,
            examDate: exam.examDate || meta.examDate,
            examTime: exam.examTime || meta.examTime
          };
        }));
      }
    };

    const fetchResults = async () => {
      const { data } = await supabase.from('results').select('*').eq('professorId', user.id);
      if (data) setResults(data);
    };

    fetchExams();
    fetchResults();

    const examsSub = supabase.channel('exams_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams', filter: `professorId=eq.${user.id}` }, fetchExams)
      .subscribe();

    const resultsSub = supabase.channel('results_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results', filter: `professorId=eq.${user.id}` }, fetchResults)
      .subscribe();

    return () => {
      supabase.removeChannel(examsSub);
      supabase.removeChannel(resultsSub);
    };
  }, [user]);

  const handleLogout = () => supabase.auth.signOut();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <LoginView error={error} setError={setError} />;
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border h-[70px] px-8 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-lg border border-slate-100 shadow-sm flex items-center gap-2">
            <img src="/cps_logo.webp" alt="Logo CPS" className="w-5 h-5 object-contain" onError={(e) => {
              (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=Logo";
            }} />
            <div className="w-px h-4 bg-slate-200"></div>
            <img src="/coc_logo.png" alt="Plataforma COC" className="h-4 object-contain" />
          </div>
          <h1 className="text-lg font-bold text-primary tracking-tight uppercase hidden md:block">Colégio Progresso Santista</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-medium text-text">{user.displayName || user.email?.replace('@cps.local', '')}</span>
            <span className="text-xs text-slate-500">{isAdmin ? 'Administrador' : 'Professor'}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[240px] bg-primary text-white flex flex-col hidden lg:flex">
          <div className="py-6 flex flex-col gap-1">
            <NavButton 
              active={view === 'dashboard'} 
              onClick={() => setView('dashboard')} 
              icon={<BarChart3 className="w-5 h-5" />} 
              label="Painel Geral" 
            />
            <NavButton 
              active={view === 'create'} 
              onClick={() => setView('create')} 
              icon={<Plus className="w-5 h-5" />} 
              label="Banco de Provas" 
            />
            <NavButton 
              active={view === 'correct'} 
              onClick={() => setView('correct')} 
              icon={<Camera className="w-5 h-5" />} 
              label="Correção Automática" 
            />
            <NavButton 
              active={view === 'guides'} 
              onClick={() => setView('guides')} 
              icon={<BookOpen className="w-5 h-5" />} 
              label="Guia de Estudos" 
            />
            <NavButton 
              active={view === 'reports'} 
              onClick={() => setView('reports')} 
              icon={<FileText className="w-5 h-5" />} 
              label="Relatórios de Turma" 
            />
            <NavButton 
              active={view === 'schedule'} 
              onClick={() => setView('schedule')} 
              icon={<Calendar className="w-5 h-5" />} 
              label="Cronograma" 
            />
            {isAdmin && (
              <NavButton 
                active={view === 'admin'} 
                onClick={() => setView('admin')} 
                icon={<UserIcon className="w-5 h-5" />} 
                label="Administração" 
              />
            )}
          </div>
          <div className="mt-auto p-6 text-[10px] uppercase tracking-widest opacity-40 font-bold">
            v2.4.0 Colégio Progresso Santista
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-[25px]">
          <AnimatePresence mode="wait">
            {view === 'dashboard' && <DashboardView exams={exams} results={results} setView={setView} onSelectPrintExam={setSelectedPrintExam} />}
            {view === 'create' && <CreateExamView user={user} setView={setView} />}
            {view === 'correct' && <CorrectExamView user={user} exams={exams} setView={setView} />}
            {view === 'guides' && <GuidesView exams={exams} />}
            {view === 'reports' && <ReportsView exams={exams} results={results} />}
            {view === 'schedule' && <ScheduleView exams={exams} />}
            {view === 'print' && selectedPrintExam && <ExamPrintView exam={selectedPrintExam} onBack={() => setView('dashboard')} />}
            {view === 'admin' && isAdmin && <AdminView user={user} />}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Nav */}
      <nav className="lg:hidden bg-white border-t border-border px-4 py-2 flex justify-around">
        <MobileNavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3 />} />
        <MobileNavButton active={view === 'create'} onClick={() => setView('create')} icon={<Plus />} />
        <MobileNavButton active={view === 'correct'} onClick={() => setView('correct')} icon={<Camera />} />
        <MobileNavButton active={view === 'schedule'} onClick={() => setView('schedule')} icon={<Calendar />} />
        <MobileNavButton active={view === 'guides'} onClick={() => setView('guides')} icon={<BookOpen />} />
      </nav>
    </div>
  );
}

// Sub-components
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-5 py-3 transition-all duration-200 text-sm font-medium w-full text-left",
        active 
          ? "bg-secondary opacity-100 border-l-4 border-accent" 
          : "opacity-80 hover:bg-secondary/50 hover:opacity-100"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon }: { active: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl transition-colors",
        active ? "text-accent bg-accent/10" : "text-slate-400"
      )}
    >
      {React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}
    </button>
  );
}

function LoginView({ error, setError }: { error: string | null, setError: (e: string | null) => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabaseEmail = `${username.toLowerCase().trim()}@cps.local`;
      const supabasePassword = password + "_cpsAuth"; // Ensures >= 6 chars

      if (isRegistering) {
        // Check if allowed
        const { data: allowed } = await supabase.from('allowed_professors').select('*').eq('username', username.toLowerCase().trim()).single();
        if (!allowed && username.toLowerCase().trim() !== 'cps') {
          throw new Error('Usuário não autorizado pelo administrador.');
        }

        const { error } = await supabase.auth.signUp({ email: supabaseEmail, password: supabasePassword });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: supabaseEmail, password: supabasePassword });
        if (error) throw error;
      }
    } catch (err: any) {
      if (err.message?.includes('rate limit')) {
        setError('Muitas tentativas. Por favor, aguarde alguns minutos antes de tentar novamente.');
      } else if (err.message?.includes('Invalid login credentials')) {
        setError('Usuário ou senha incorretos.');
      } else if (err.message?.includes('User already registered')) {
        setError('Este usuário já está em uso.');
      } else {
        setError(err.message || 'Ocorreu um erro ao autenticar.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-lg shadow-xl p-10 text-center border border-border"
      >
        <div className="bg-white w-full max-w-[200px] h-16 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100 gap-3 px-4">
          <img src="/cps_logo.webp" alt="Logo CPS" className="w-10 h-10 object-contain" onError={(e) => {
              (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=Logo";
          }} />
          <div className="w-px h-8 bg-slate-200"></div>
          <img src="/coc_logo.png" alt="Plataforma COC" className="h-6 object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-primary mb-2 uppercase tracking-tight">Colégio Progresso Santista</h1>
        <p className="text-slate-500 mb-8 text-sm">Acesso restrito para professores.</p>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-bold mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="text" 
            placeholder="Usuário" 
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-md border border-border focus:border-accent outline-none text-sm"
          />
          <input 
            type="password" 
            placeholder="Senha" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-md border border-border focus:border-accent outline-none text-sm"
          />
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3 px-6 rounded-md font-bold flex items-center justify-center gap-3 hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRegistering ? 'Registrar' : 'Entrar')}
          </button>
        </form>

        <div className="mt-6 text-sm">
          <button 
            onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
            className="text-accent font-bold hover:underline"
          >
            {isRegistering ? 'Já tenho uma conta. Entrar.' : 'Não tem conta? Registrar.'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DashboardView({ exams, results, setView, onSelectPrintExam }: { exams: Exam[], results: Result[], setView: (v: any) => void, onSelectPrintExam: (e: Exam) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <StatCard label="Provas Criadas" value={exams.length} icon={<FileText />} color="" />
        <StatCard label="Correções Pendentes" value={results.filter(r => r.score === undefined).length} icon={<CheckCircle2 />} color="" />
        <StatCard label="Média Geral (PII)" value={results.filter(r => exams.find(e => e.id === r.examId)?.examType === 'PII').length ? (results.filter(r => exams.find(e => e.id === r.examId)?.examType === 'PII').reduce((acc, r) => acc + (r.score/r.maxScore), 0) / results.filter(r => exams.find(e => e.id === r.examId)?.examType === 'PII').length * 10).toFixed(1) : '0.0'} icon={<BarChart3 />} color="" />
        <StatCard label="Alunos Avaliados" value={results.length} icon={<UserIcon />} color="" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="lg:col-span-3 bg-white rounded-lg border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border flex justify-between items-center bg-[#fcfcfd]">
            <h3 className="text-base font-bold text-primary">Avaliações Recentes</h3>
            <span className="text-[12px] text-accent font-bold cursor-pointer hover:underline">Ver Banco de Dados Completo</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#f8fafc]">
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Identificador</th>
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Turma</th>
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Matéria</th>
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Tipo</th>
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Data</th>
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Status</th>
                  <th className="text-left px-5 py-3 text-[#4a5568] font-semibold border-b border-border">Ações</th>
                </tr>
              </thead>
              <tbody>
                {exams.slice(0, 6).map(exam => (
                  <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 border-b border-border font-medium text-slate-600">#PRV-{exam.id.slice(-4).toUpperCase()}</td>
                    <td className="px-5 py-3 border-b border-border text-slate-700 font-bold">{exam.classYear || '--'}</td>
                    <td className="px-5 py-3 border-b border-border text-slate-700">{exam.subject}</td>
                    <td className="px-5 py-3 border-b border-border text-slate-700">{exam.examType}</td>
                    <td className="px-5 py-3 border-b border-border text-slate-500">{new Date(exam.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3 border-b border-border">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[11px] font-bold uppercase",
                        results.some(r => r.examId === exam.id) ? "bg-[#c6f6d5] text-[#22543d]" : "bg-[#feebc8] text-[#744210]"
                      )}>
                        {results.some(r => r.examId === exam.id) ? 'Corrigida' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-5 py-3 border-b border-border text-slate-500">
                      <button 
                        onClick={() => {
                          onSelectPrintExam(exam);
                          setView('print');
                        }}
                        className="text-accent font-bold hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-4 h-4" />
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))}
                {exams.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400">Nenhuma prova criada ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-1 flex flex-col gap-5">
          <button 
            onClick={() => setView('create')}
            className="bg-accent text-white p-3 rounded-md font-bold text-sm hover:bg-accent/90 transition-all shadow-sm"
          >
            + Criar Nova Prova
          </button>
          <button 
            className="bg-white text-primary border border-primary p-3 rounded-md font-bold text-sm hover:bg-primary hover:text-white transition-all shadow-sm"
          >
            Exportar Caderno (Gabarito)
          </button>
          
          <div className="bg-[#edf2f7] p-4 rounded-lg border-l-4 border-primary text-[13px] leading-relaxed">
            <h4 className="font-bold text-primary mb-2">📍 Guia de Estudo</h4>
            <p className="text-slate-600 mb-3">Prepare o material de apoio para os alunos. Inclua tópicos, referências bibliográficas e exercícios recomendados.</p>
            <button 
              onClick={() => setView('guides')}
              className="text-[11px] border border-[#718096] px-2 py-1 rounded hover:bg-white transition-all font-bold text-slate-600"
            >
              Editar Conteúdos
            </button>
          </div>

          <div className="bg-[#ebf8ff] p-4 rounded-lg border-l-4 border-accent text-[13px] leading-relaxed">
            <h4 className="font-bold text-primary mb-2">📈 Desempenho</h4>
            <p className="text-slate-600">A evolução média subiu 12% em relação à PII anterior. Continue monitorando os resultados.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, icon, color }: { label: string, value: any, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-5 rounded-lg border border-border shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex flex-col gap-1">
      <span className="text-[12px] text-[#718096] uppercase tracking-[0.5px] font-bold">{label}</span>
      <h3 className="text-2xl font-bold text-primary">{value}</h3>
    </div>
  );
}

function CreateExamView({ user, setView }: { user: User, setView: (v: any) => void }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [classYear, setClassYear] = useState('6º ano');
  const [content, setContent] = useState('');
  const [examType, setExamType] = useState<'PII' | 'PIII'>('PII');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);

  const addQuestion = () => {
    setQuestions([...questions, {
      id: questions.length + 1,
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 'A'
    }]);
  };

  const handleSave = async () => {
    if (!title || !subject || questions.length === 0) return;
    setSaving(true);
    try {
      const answerKey: Record<string, any> = {
        _metadata: {
          classYear,
          content,
          examType,
          examDate,
          examTime
        }
      };
      questions.forEach(q => {
        answerKey[q.id] = q.correctAnswer;
      });

      // Generate study guide automatically
      const promptText = content 
        ? `${title} - ${subject} (${classYear}). Conteúdo programático: ${content}. Baseado nisso e nas questões: ${questions.map(q => q.text).join(', ')}` 
        : `${title} - ${subject}: ${questions.map(q => q.text).join(', ')}`;
      const guide = await generateStudyGuide(promptText);

      const { error } = await supabase.from('exams').insert({
        title,
        subject,
        questions,
        answerKey,
        studyGuide: guide,
        professorId: user.id,
        createdAt: new Date().toISOString()
      });
      
      if (error) {
        alert("Erro no Supabase: " + error.message);
        throw error;
      }
      setView('dashboard');
    } catch (err) {
      console.error("Error saving exam:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">Nova Prova</h2>
        <div className="flex gap-3">
          <button onClick={() => setView('dashboard')} className="px-4 py-2 text-slate-500 font-bold text-sm">Cancelar</button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-accent text-white px-6 py-2 rounded-md font-bold text-sm flex items-center gap-2 hover:bg-accent/90 transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Download className="w-4 h-4" />}
            Salvar Prova
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-border shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Título da Prova</label>
            <input 
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Prova Mensal de História"
              className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none transition-all text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Turma / Ano</label>
            <select 
              value={classYear}
              onChange={e => setClassYear(e.target.value)}
              className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none transition-all text-sm bg-white"
            >
              <option value="6º ano">6º ano</option>
              <option value="7º ano">7º ano</option>
              <option value="8º ano">8º ano</option>
              <option value="9º ano">9º ano</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Matéria</label>
            <input 
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Ex: História Geral"
              className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none transition-all text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tipo de Prova</label>
            <div className="flex gap-4">
              {['PII', 'PIII'].map(type => (
                <button
                  key={type}
                  onClick={() => setExamType(type as any)}
                  className={cn(
                    "flex-1 py-2 rounded-md border font-bold text-sm transition-all",
                    examType === type 
                      ? "bg-primary border-primary text-white shadow-sm" 
                      : "bg-white border-border text-slate-500 hover:border-slate-300"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Data da Prova</label>
            <input 
              type="date"
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
              className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none transition-all text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Horário</label>
            <input 
              type="time"
              value={examTime}
              onChange={e => setExamTime(e.target.value)}
              className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none transition-all text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Conteúdo Programático</label>
          <textarea 
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Ex: Revolução Revolução Francesa, Iluminismo... (Opcional, usado para guiar os estudos dos alunos e compor o cronograma)"
            className="w-full px-4 py-3 rounded-md border border-border focus:border-accent outline-none transition-all text-sm min-h-[80px]"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">Questões</h3>
          <button 
            onClick={addQuestion}
            className="text-accent font-bold text-sm flex items-center gap-2 hover:underline"
          >
            <Plus className="w-4 h-4" />
            Adicionar Questão
          </button>
        </div>

        {questions.map((q, idx) => (
          <div key={idx} className="bg-white p-6 rounded-lg border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider">Questão {q.id}</span>
              <button 
                onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea 
              value={q.text}
              onChange={e => {
                const newQs = [...questions];
                newQs[idx].text = e.target.value;
                setQuestions(newQs);
              }}
              placeholder="Enunciado da questão..."
              className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none transition-all min-h-[80px] text-sm"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['A', 'B', 'C', 'D'].map((opt, optIdx) => (
                <div key={opt} className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      const newQs = [...questions];
                      newQs[idx].correctAnswer = opt;
                      setQuestions(newQs);
                    }}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all",
                      q.correctAnswer === opt 
                        ? "bg-primary border-primary text-white" 
                        : "border-border text-slate-400 hover:border-slate-300"
                    )}
                  >
                    {opt}
                  </button>
                  <input 
                    value={q.options[optIdx]}
                    onChange={e => {
                      const newQs = [...questions];
                      newQs[idx].options[optIdx] = e.target.value;
                      setQuestions(newQs);
                    }}
                    placeholder={`Opção ${opt}`}
                    className="flex-1 px-3 py-1.5 rounded border border-slate-100 focus:border-accent outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function CorrectExamView({ user, exams, setView }: { user: User, exams: Exam[], setView: (v: any) => void }) {
  const [selectedExamId, setSelectedExamId] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCorrect = async () => {
    if (!selectedExamId || !image) return;
    const exam = exams.find(e => e.id === selectedExamId);
    if (!exam) return;

    setCorrecting(true);
    try {
      const base64 = image.split(',')[1];
      const correction = await correctExamFromImage(base64, exam.title, exam.answerKey);
      
      const resultData = {
        examId: selectedExamId,
        professorId: user.id,
        studentName: correction.studentName,
        score: correction.score,
        maxScore: correction.maxScore,
        feedback: correction.feedback,
        correctedAt: new Date().toISOString()
      };

      const { error } = await supabase.from('results').insert(resultData);
      if (error) throw error;
      
      setResult(correction);
    } catch (err) {
      console.error(err);
    } finally {
      setCorrecting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <h2 className="text-xl font-bold text-primary">Correção Automática</h2>
      
      <div className="bg-white p-6 rounded-lg border border-border shadow-sm space-y-6">
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Selecione a Prova</label>
          <select 
            value={selectedExamId}
            onChange={e => setSelectedExamId(e.target.value)}
            className="w-full px-4 py-2 rounded-md border border-border focus:border-accent outline-none text-sm"
          >
            <option value="">Escolha uma prova...</option>
            {exams.map(e => (
              <option key={e.id} value={e.id}>{e.title} ({e.examType})</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Foto do Gabarito</label>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all",
              image ? "border-accent/20 bg-accent/5" : "border-border hover:border-accent/40 hover:bg-slate-50"
            )}
          >
            {image ? (
              <div className="space-y-4">
                <img src={image} className="max-h-[250px] mx-auto rounded-md shadow-md" alt="Preview" />
                <p className="text-accent font-bold text-sm">Clique para trocar a foto</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                  <Camera className="text-slate-400 w-6 h-6" />
                </div>
                <div>
                  <p className="text-primary font-bold text-sm">Tirar foto ou Upload</p>
                  <p className="text-slate-500 text-[12px]">Envie a foto do gabarito preenchido pelo aluno.</p>
                </div>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
              capture="environment"
            />
          </div>
        </div>

        <button 
          onClick={handleCorrect}
          disabled={!image || !selectedExamId || correcting}
          className="w-full bg-accent text-white py-3 rounded-md font-bold text-sm flex items-center justify-center gap-3 hover:bg-accent/90 transition-all shadow-sm disabled:opacity-50"
        >
          {correcting ? (
            <>
              <Loader2 className="animate-spin w-5 h-5" />
              Analisando com IA...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Corrigir Agora
            </>
          )}
        </button>
      </div>

      {result && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#c6f6d5] border border-[#38a169]/20 p-6 rounded-lg space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#22543d]">Resultado da Correção</h3>
            <span className="bg-[#38a169] text-white px-3 py-1 rounded-full text-sm font-bold">
              Nota: {result.score} / {result.maxScore}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-[#22543d] font-bold text-sm">Aluno: {result.studentName}</p>
            <p className="text-[#22543d]/80 italic text-sm">"{result.feedback}"</p>
          </div>
          <button 
            onClick={() => {
              setResult(null);
              setImage(null);
            }}
            className="text-[#22543d] font-bold text-[12px] hover:underline"
          >
            Corrigir próxima prova
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

function GuidesView({ exams }: { exams: Exam[] }) {
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">Guias de Estudo</h2>
        {selectedExam && (
          <button 
            onClick={() => exportToPDF(`guide-${selectedExam.id}`, `Guia-${selectedExam.title}`)}
            className="bg-white border border-border text-slate-700 px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Suas Provas</h3>
          {exams.map(exam => (
            <button
              key={exam.id}
              onClick={() => setSelectedExam(exam)}
              className={cn(
                "w-full text-left px-4 py-3 rounded-md border transition-all text-sm",
                selectedExam?.id === exam.id 
                  ? "bg-primary border-primary text-white shadow-sm" 
                  : "bg-white border-border text-slate-700 hover:border-accent/40"
              )}
            >
              <p className="font-bold">{exam.title}</p>
              <p className={cn("text-[11px] opacity-70 font-bold uppercase", selectedExam?.id === exam.id ? "text-white" : "text-slate-500")}>
                {exam.subject}
              </p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selectedExam ? (
            <div id={`guide-${selectedExam.id}`} className="bg-white p-8 rounded-lg border border-border min-h-[500px]">
              <div className="border-b border-border pb-4 mb-6">
                <h3 className="text-2xl font-bold text-primary mb-1">{selectedExam.title}</h3>
                <p className="text-accent font-bold uppercase tracking-widest text-[11px]">Guia de Estudos • {selectedExam.subject}</p>
              </div>
              <div className="prose prose-slate max-w-none">
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed text-sm">
                  {selectedExam.studyGuide}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border-2 border-dashed border-border rounded-lg p-20 text-center">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-bold text-sm">Selecione uma prova para ver o guia de estudos gerado por IA.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminView({ user }: { user: User }) {
  const [username, setUsername] = useState('');
  const [allowedUsers, setAllowedUsers] = useState<{id: string, username: string}[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAllowed = async () => {
      const { data } = await supabase.from('allowed_professors').select('*');
      if (data) setAllowedUsers(data);
    };
    fetchAllowed();

    const sub = supabase.channel('allowed_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allowed_professors' }, fetchAllowed)
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    setLoading(true);
    try {
      const cleanUsername = username.toLowerCase().trim();
      const supabaseEmail = `${cleanUsername}@cps.local`;
      const { error } = await supabase.from('allowed_professors').insert({
        email: supabaseEmail,
        username: cleanUsername,
        addedBy: user.id,
        createdAt: new Date().toISOString()
      });
      if (error) throw error;
      setUsername('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      await supabase.from('allowed_professors').delete().eq('id', userId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-primary">Administração de Professores</h2>
      
      <div className="bg-white p-6 rounded-lg border border-border shadow-sm">
        <h3 className="text-base font-bold text-primary mb-4">Adicionar Professor Autorizado</h3>
        <form onSubmit={handleAddUser} className="flex gap-4">
          <input 
            type="text" 
            placeholder="Usuário do professor..." 
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="flex-1 px-4 py-2 rounded-md border border-border focus:border-accent outline-none text-sm"
          />
          <button 
            type="submit"
            disabled={loading}
            className="bg-accent text-white px-6 py-2 rounded-md font-bold text-sm hover:bg-accent/90 transition-all shadow-sm disabled:opacity-50"
          >
            Adicionar
          </button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-lg border border-border shadow-sm">
        <h3 className="text-base font-bold text-primary mb-4">Professores Autorizados ({allowedUsers.length})</h3>
        <div className="space-y-2">
          {allowedUsers.map(item => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-100">
              <span className="font-medium text-slate-700 text-sm">{item.username}</span>
              <button 
                onClick={() => handleRemoveUser(item.id)}
                className="text-red-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {allowedUsers.length === 0 && (
            <p className="text-center text-slate-400 py-4 text-sm">Nenhum professor autorizado ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportsView({ exams, results }: { exams: Exam[], results: Result[] }) {
  const [selectedExamId, setSelectedExamId] = useState('');
  
  const filteredResults = selectedExamId 
    ? results.filter(r => r.examId === selectedExamId)
    : results;

  const averageScore = filteredResults.length 
    ? (filteredResults.reduce((acc, r) => acc + (r.score/r.maxScore), 0) / filteredResults.length * 10).toFixed(1)
    : 0;

  const scoreDistribution = [
    { name: '0-5', value: filteredResults.filter(r => (r.score/r.maxScore) < 0.5).length },
    { name: '5-7', value: filteredResults.filter(r => (r.score/r.maxScore) >= 0.5 && (r.score/r.maxScore) < 0.7).length },
    { name: '7-9', value: filteredResults.filter(r => (r.score/r.maxScore) >= 0.7 && (r.score/r.maxScore) < 0.9).length },
    { name: '9-10', value: filteredResults.filter(r => (r.score/r.maxScore) >= 0.9).length },
  ];

  const COLORS = ['#EF4444', '#F59E0B', '#3182ce', '#38a169'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">Relatórios de Desempenho</h2>
        <select 
          value={selectedExamId}
          onChange={e => setSelectedExamId(e.target.value)}
          className="bg-white border border-border px-4 py-2 rounded-md outline-none text-sm font-bold text-slate-600"
        >
          <option value="">Todas as Provas</option>
          {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Média da Turma" value={averageScore} icon={<BarChart3 />} color="" />
        <StatCard label="Total de Alunos" value={filteredResults.length} icon={<UserIcon />} color="" />
        <StatCard label="Taxa de Aprovação" value={filteredResults.length ? (filteredResults.filter(r => (r.score/r.maxScore) >= 0.6).length / filteredResults.length * 100).toFixed(0) + '%' : '0%'} icon={<CheckCircle2 />} color="" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-border shadow-sm">
          <h3 className="text-base font-bold text-primary mb-6">Distribuição de Notas</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scoreDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {scoreDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            {scoreDistribution.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-[10px] text-slate-500 font-bold uppercase">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-border shadow-sm">
          <h3 className="text-base font-bold text-primary mb-6">Lista de Resultados</h3>
          <div className="space-y-3">
            {filteredResults.map(result => (
              <div key={result.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-100">
                <div>
                  <p className="font-bold text-slate-700 text-sm">{result.studentName}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">{new Date(result.correctedAt).toLocaleDateString()}</p>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full font-bold text-xs",
                  (result.score/result.maxScore) >= 0.6 ? "bg-[#c6f6d5] text-[#22543d]" : "bg-red-100 text-red-700"
                )}>
                  {result.score} / {result.maxScore}
                </div>
              </div>
            ))}
            {filteredResults.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Nenhum resultado encontrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleView({ exams }: { exams: Exam[] }) {
  const sortedExams = [...exams].sort((a, b) => {
    if (!a.examDate) return 1;
    if (!b.examDate) return -1;
    return new Date(a.examDate).getTime() - new Date(b.examDate).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">Cronograma de Provas</h2>
        <button 
          onClick={() => exportToPDF('schedule-table', 'Cronograma-Provas')}
          className="bg-accent text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 hover:bg-accent/90 shadow-sm"
        >
          <Download className="w-4 h-4" />
          Imprimir Cronograma
        </button>
      </div>

      <div id="schedule-table" className="bg-white rounded-lg border border-border overflow-hidden p-8">
        <div className="text-center mb-8 border-b border-border pb-6">
          <div className="w-fit h-14 rounded-lg flex items-center justify-center mx-auto mb-4 bg-white px-4 border border-slate-100 gap-4">
            <img src="/cps_logo.webp" alt="Logo CPS" className="w-10 h-10 object-contain" onError={(e) => {
              (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=Logo";
            }} />
            <div className="w-px h-8 bg-slate-200"></div>
            <img src="/coc_logo.png" alt="Plataforma COC" className="h-6 object-contain" />
          </div>
          <h1 className="text-xl font-bold text-primary uppercase">Colégio Progresso Santista</h1>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Cronograma de Avaliações Semestrais</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-6 py-4 border border-border text-xs font-bold text-slate-500 uppercase">Data</th>
                <th className="text-left px-6 py-4 border border-border text-xs font-bold text-slate-500 uppercase">Horário</th>
                <th className="text-left px-6 py-4 border border-border text-xs font-bold text-slate-500 uppercase">Turma</th>
                <th className="text-left px-6 py-4 border border-border text-xs font-bold text-slate-500 uppercase">Disciplina</th>
                <th className="text-left px-6 py-4 border border-border text-xs font-bold text-slate-500 uppercase">Tipo</th>
                <th className="text-left px-6 py-4 border border-border text-xs font-bold text-slate-500 uppercase">Conteúdo Sugerido</th>
              </tr>
            </thead>
            <tbody>
              {sortedExams.map((exam, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 border border-border font-bold text-primary text-sm">
                    {exam.examDate ? new Date(exam.examDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'A definir'}
                  </td>
                  <td className="px-6 py-4 border border-border text-slate-600 text-sm">{exam.examTime || '--:--'}</td>
                  <td className="px-6 py-4 border border-border font-bold text-slate-800 text-sm whitespace-nowrap">{exam.classYear || '--'}</td>
                  <td className="px-6 py-4 border border-border font-bold text-slate-800 text-sm">{exam.subject}</td>
                  <td className="px-6 py-4 border border-border text-slate-600 text-sm">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold uppercase">{exam.examType}</span>
                  </td>
                  <td className="px-6 py-4 border border-border text-slate-500 text-xs truncate max-w-[300px]" title={exam.content || exam.studyGuide}>
                    {exam.content ? exam.content.slice(0, 100) : exam.studyGuide?.slice(0, 100)}...
                  </td>
                </tr>
              ))}
              {exams.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Nenhuma prova cadastrada no sistema.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 pt-6 border-t border-dashed border-border flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
          <span>Emitido em: {new Date().toLocaleDateString()}</span>
          <span>EduGrade Pro • Colégio Progresso Santista</span>
        </div>
      </div>
    </div>
  );
}

function ExamPrintView({ exam, onBack }: { exam: Exam, onBack: () => void }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const handleExportSheets = async () => {
    setIsExporting(true);
    await exportMultipleToPDF('answer-sheet-page', `Gabaritos-${exam.title.replace(/\s+/g, '_')}`, setExportProgress);
    setIsExporting(false);
    setExportProgress("");
  };

  const studentsToPrint = STUDENTS_DB[exam.classYear || ''] || [{ name: '', classId: '' }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="text-slate-500 font-bold text-sm flex items-center gap-2 hover:text-slate-700"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Voltar ao Painel
        </button>
        <div className="flex gap-3">
          <button 
            onClick={() => exportToPDF('exam-content', `Prova-${exam.title}`)}
            className="bg-primary text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 hover:bg-primary/90 shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Imprimir Prova
          </button>
          <button 
            onClick={handleExportSheets}
            disabled={isExporting}
            className="bg-accent text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 hover:bg-accent/90 shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? exportProgress || 'Gerando...' : 'Imprimir Cadernos de Resposta'}
          </button>
        </div>
      </div>

      {/* Standardized Exam Layout */}
      <div id="exam-content" className="bg-white p-8 border border-border max-w-[210mm] mx-auto min-h-[297mm] text-black">
        {/* Main Header Box */}
        <div className="border-[3px] border-black border-dashed p-1 mb-8">
          
          {/* Top Row: Logos and School Name */}
          <div className="flex items-center justify-between border-b-[3px] border-black border-dashed pb-2 mb-1 px-4">
            <div className="flex items-center gap-4">
              <img src="/cps_logo.webp" alt="Logo CPS" className="w-12 h-12 object-contain" />
              <div className="flex flex-col border-l border-black pl-3 py-1">
                <span className="text-[6px] uppercase font-bold text-slate-800 leading-none mb-1">Plataforma<br/>de Educação</span>
                <img src="/coc_logo.png" alt="COC" className="h-4 object-contain" />
              </div>
            </div>
            <h1 className="text-2xl font-bold uppercase text-center flex-1 tracking-wide mr-12">Colégio Progresso Santista</h1>
          </div>

          {/* Student Info Fields */}
          <div className="text-[12px] font-bold flex flex-col uppercase">
            {/* Row 1 */}
            <div className="flex border-b-[3px] border-black border-dashed">
              <div className="flex-[3] border-r-[3px] border-black border-dashed px-2 py-0.5 flex items-end">
                Nome:<span className="flex-1 border-b border-black mx-2 mb-1"></span>
              </div>
              <div className="flex-1 border-r-[3px] border-black border-dashed px-2 py-0.5 whitespace-nowrap">
                Classe: {exam.classYear || '____'}
              </div>
              <div className="flex-1 px-2 py-0.5 whitespace-nowrap">
                Valor: <span className="border-b border-black w-10 inline-block"></span>
              </div>
            </div>
            {/* Row 2 */}
            <div className="flex border-b-[3px] border-black border-dashed">
              <div className="flex-[2] border-r-[3px] border-black border-dashed px-2 py-0.5">
                Disciplina: <span className="font-normal normal-case">{exam.subject}</span>
              </div>
              <div className="flex-[2] border-r-[3px] border-black border-dashed px-2 py-0.5 flex">
                Prof:<span className="flex-1 border-b border-black ml-2 mb-1"></span>
              </div>
              <div className="flex-1 border-r-[3px] border-black border-dashed px-2 py-0.5">
                Data: <span className="font-normal">{exam.examDate ? new Date(exam.examDate + 'T00:00:00').toLocaleDateString('pt-BR') : '___/___/____'}</span>
              </div>
              <div className="flex-1 px-2 py-0.5 whitespace-nowrap">
                Nota: <span className="border-b border-black w-12 inline-block"></span>
              </div>
            </div>
            {/* Row 3 */}
            <div className="flex">
              <div className="flex-[4] border-r-[3px] border-black border-dashed px-2 py-1 normal-case">
                <span className="uppercase">Instruções:</span>
                <ul className="text-[11px] font-normal list-none ml-6 mt-0.5 space-y-0 text-black">
                  <li>❖ Faça letra legível;</li>
                  <li>❖ Mantenha a limpeza e a organização da prova;</li>
                  <li>❖ Evite rasuras e não deixe questões em branco.</li>
                </ul>
              </div>
              <div className="flex-1 flex flex-col justify-between items-center text-center px-0 py-0">
                <div className="w-full border-b-[3px] border-black border-dashed pb-1 pt-1 h-1/2 flex items-center justify-center">
                  Ass. do professor
                </div>
                <div className="h-1/2 flex items-center justify-center">
                  {exam.examType}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content / Title */}
        {(() => {
          const displayTitle = (exam.content || exam.title)
            .replace(/[-–]?\s*\(?\b(PII|PIII)\b\)?\s*/gi, '')
            .replace(/\(\s*\)/g, '')
            .trim();
            
          if (!displayTitle) return null;
          
          return (
            <div className="text-center mb-8 px-8">
              <h2 className="text-sm font-bold">{displayTitle}</h2>
            </div>
          );
        })()}

        {/* Questions */}
        <div className="space-y-10">
          {exam.questions.map((q, idx) => (
            <div key={q.id} className="space-y-4 break-inside-avoid">
              <div className="w-full text-center px-4">
                <span className="font-bold text-sm mr-1">{idx + 1}.</span>
                <span className="text-sm font-bold leading-relaxed">{q.text}</span>
              </div>
              <div className="flex flex-col items-start w-fit mx-auto space-y-1">
                {['a', 'b', 'c', 'd'].map((letter, i) => (
                  <div key={letter} className="flex gap-2">
                    <span className="text-sm">{letter})</span>
                    <span className="text-sm">{q.options[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 pt-8 border-t border-slate-100 text-center text-[9px] text-slate-300 font-bold uppercase">
          Boa Prova! • Colégio Progresso Santista
        </div>
      </div>

      {/* Answer Sheets Pattern - Repeated mapped elements */}
      <div id="answer-sheets-container" className="space-y-12">
        {studentsToPrint.map((student, sIdx) => (
          <div key={sIdx} className="answer-sheet-page bg-white p-12 border border-border max-w-[210mm] mx-auto mt-10">
            <div className="text-center border-b-2 border-primary pb-6 mb-8">
              <h2 className="text-lg font-black text-primary uppercase">Caderno de Respostas • Folha Óptica</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                {exam.title.replace(/[-–]?\s*\(?\b(PII|PIII)\b\)?\s*/gi, '').replace(/\(\s*\)/g, '').trim()} • {exam.subject}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-10">
              <div className="col-span-3 border border-slate-200 p-4 rounded bg-slate-50">
                <label className="block text-[10px] font-black text-primary uppercase mb-1">Nome do Aluno:</label>
                <div className="h-8 border-b-2 border-slate-400 flex items-end pb-1 font-bold text-slate-800 text-lg uppercase">{student.name}</div>
              </div>
              <div className="border border-slate-200 p-4 rounded bg-slate-50">
                <label className="block text-[10px] font-black text-primary uppercase mb-1 text-center">Turma:</label>
                <div className="h-8 border-b-2 border-slate-400 flex items-end justify-center pb-1 font-black text-primary text-xl uppercase tracking-widest">{student.classId || exam.classYear}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12 p-6 border-2 border-slate-100 rounded-xl">
              {exam.questions.map((q, idx) => (
                <div key={q.id} className="flex items-center gap-4">
                  <span className="w-8 font-black text-primary text-sm">{String(idx + 1).padStart(2, '0')}</span>
                  <div className="flex gap-2">
                    {['A', 'B', 'C', 'D'].map(letter => (
                      <div 
                        key={letter}
                        className="w-10 h-10 rounded-full border-2 border-slate-300 flex items-center justify-center text-xs font-black text-slate-400"
                      >
                        {letter}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 bg-slate-50 p-6 rounded-lg border border-slate-200">
              <h3 className="text-xs font-black text-primary uppercase mb-4">Instruções de Preenchimento:</h3>
              <ul className="text-[10px] text-slate-600 space-y-2 list-disc ml-4 font-bold">
                <li>Utilize apenas caneta esferográfica azul ou preta.</li>
                <li>Preencha completamente o círculo da resposta escolhida.</li>
                <li>Não serão aceitas rasuras ou marcas duplas.</li>
                <li>O preenchimento incorreto anulará a questão.</li>
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

