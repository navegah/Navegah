import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  Link as LinkIcon, 
  Users, 
  MapPin, 
  Plus, 
  LogOut, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);

  // Constants
  const CLIENTS = [
    'Navegah',
    'Dr. Nicolas Lamas',
    'Dr. Felipe Morais',
    'Dr. Gustavo Fonseca',
    'Clínica Toledo',
    'Joharc Imóveis',
    'Frimel',
    'BA.Z Planejados',
    'Madrid Empreendimentos',
    'Stone Chapelaria',
    'Móveis Belas Artes',
    'Ideia Bonés',
    'Cazarin Motors',
    'Vila Nova Casing',
    'SUNAP',
    'Lebi Construtora',
    'Outros'
  ];

  const EVENT_TYPES = [
    'Navegah (Pedro)',
    'Navegah (Captação)',
    'Navegah (Reuniões)',
    'Navegah (Visita técnica)'
  ];

  const TEAM_MEMBERS = [
    { name: 'Pedro', email: 'pedro@navegah.com.br' },
    { name: 'Polly', email: 'planejamento2.navegah@gmail.com' },
    { name: 'Jhony', email: 'criacao2.navegah@gmail.com' },
    { name: 'Marluce', email: 'atendimento.navegah@gmail.com' },
    { name: 'Matheus', email: 'criacao.navegah@gmail.com' },
    { name: 'Ramon', email: 'ramoncamilo.rc@gmail.com' },
  ];

  const DURATIONS = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '1 hora', value: 60 },
    { label: '1.5 horas', value: 90 },
    { label: '2 horas', value: 120 },
    { label: '3 horas', value: 180 },
  ];

  // Helper to get next full hour
  const getNextHour = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  // Form State
  const [formData, setFormData] = useState({
    calendarName: '',
    client: '',
    otherClient: '',
    title: '',
    start: getNextHour(),
    duration: 60,
    location: '',
    description: '',
    guests: '',
    team: [] as string[],
    isOnline: false,
  });

  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [calendars, setCalendars] = useState<any[]>([]);

  const suggestNextSlot = async () => {
    setIsSuggesting(true);
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Check next 7 days
      
      const res = await fetch('/api/calendar/freebusy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeMin,
          timeMax,
          calendarIds: ['primary'] // Check primary calendar for availability
        }),
      });

      if (!res.ok) throw new Error('Failed to fetch freebusy');
      const data = await res.json();
      const busy = data.calendars.primary.busy;

      // Simple algorithm to find the first 1-hour free slot between 09:00 and 18:00
      let current = new Date();
      current.setMinutes(0, 0, 0);
      if (current.getHours() < 9) current.setHours(9);
      if (current.getHours() >= 18) {
        current.setDate(current.getDate() + 1);
        current.setHours(9);
      }

      let found = false;
      while (!found && current < new Date(timeMax)) {
        const slotStart = current.getTime();
        const slotEnd = slotStart + 60 * 60000;
        
        const isBusy = busy.some((b: any) => {
          const bStart = new Date(b.start).getTime();
          const bEnd = new Date(b.end).getTime();
          return (slotStart < bEnd && slotEnd > bStart);
        });

        if (!isBusy) {
          const pad = (n: number) => n.toString().padStart(2, '0');
          const formatted = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}T${pad(current.getHours())}:${pad(current.getMinutes())}`;
          setFormData(prev => ({ ...prev, start: formatted }));
          found = true;
        } else {
          current.setMinutes(current.getMinutes() + 30);
          if (current.getHours() >= 18) {
            current.setDate(current.getDate() + 1);
            current.setHours(9);
          }
        }
      }
    } catch (err) {
      console.error('Error suggesting slot:', err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const setQuickTime = (type: 'now' | 'today_afternoon' | 'tomorrow_morning') => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    if (type === 'now') {
      now.setMinutes(now.getMinutes() + 5); // 5 mins from now
    } else if (type === 'today_afternoon') {
      now.setHours(14, 0, 0, 0);
    } else if (type === 'tomorrow_morning') {
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
    }

    const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setFormData(prev => ({ ...prev, start: formatted }));
  };

  // Auto-update title based on type and client
  useEffect(() => {
    const clientName = formData.client === 'Outros' ? formData.otherClient : formData.client;
    let type = '';
    
    if (formData.calendarName === 'Navegah (Reuniões)') type = 'Reunião';
    else if (formData.calendarName === 'Navegah (Captação)') type = 'Captação';
    else if (formData.calendarName === 'Navegah (Visita técnica)') type = 'Visita técnica';

    if (clientName && type) {
      setFormData(prev => ({ ...prev, title: `${type} ${clientName} —` }));
    } else if (clientName) {
      setFormData(prev => ({ ...prev, title: clientName }));
    } else if (type) {
      setFormData(prev => ({ ...prev, title: `${type} —` }));
    }
  }, [formData.calendarName, formData.client, formData.otherClient]);

  useEffect(() => {
    checkAuth();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        fetchCalendars();
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendars = async () => {
    try {
      const res = await fetch('/api/calendar/list');
      if (res.ok) {
        const data = await res.json();
        setCalendars(data);
      }
    } catch (err) {
      console.error('Error fetching calendars:', err);
    }
  };

  const authorizeTeam = async (specificEmail?: string) => {
    // Improved matching: search by summary OR check if it's the primary calendar
    const selectedCal = calendars.find(c => 
      c.summary?.trim().toLowerCase() === formData.calendarName.trim().toLowerCase() ||
      (formData.calendarName === 'Navegah (Pedro)' && c.primary)
    );
    
    if (!selectedCal) {
      setError('Não foi possível identificar o ID desta agenda no Google. Tente selecionar outra e voltar para esta.');
      return;
    }

    if (selectedCal.accessRole !== 'owner') {
      setError('Apenas o DONO da agenda pode dar permissões. Você parece ter acesso de: ' + selectedCal.accessRole);
      return;
    }

    setIsAuthorizing(true);
    try {
      const emails = specificEmail 
        ? [specificEmail] 
        : TEAM_MEMBERS
            .map(m => m.email)
            .filter(email => email !== user?.email);

      console.log('Authorizing emails:', emails, 'on calendar:', selectedCal.id);

      const res = await fetch('/api/calendar/acl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: selectedCal.id,
          emails
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const successCount = data.results.filter((r: any) => r.status === 'success').length;
        const errors = data.results.filter((r: any) => r.status === 'error');
        
        if (successCount > 0) {
          alert(`${successCount} acesso(s) de edição configurado(s) com sucesso!`);
        }
        
        if (errors.length > 0) {
          const errorMsg = errors.map((e: any) => `${e.email}: ${e.message}`).join('\n');
          alert(`Atenção: Alguns acessos não puderam ser alterados:\n${errorMsg}`);
        }
        
        fetchCalendars();
      } else {
        throw new Error('Erro na comunicação com o servidor');
      }
    } catch (err) {
      setError('Erro ao autorizar. Certifique-se de que você fez Logout e Login novamente aceitando todas as permissões.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const authorizeMarluceAll = async () => {
    setIsAuthorizing(true);
    try {
      const res = await fetch('/api/calendar/acl/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: ['atendimento.navegah@gmail.com']
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const successCount = data.results.filter((r: any) => r.status === 'success').length;
        const errors = data.results.filter((r: any) => r.status === 'error');
        
        if (successCount > 0) {
          alert(`Marluce agora tem acesso de edição em ${successCount} das suas agendas!`);
        }
        
        if (errors.length > 0) {
          const errorMsg = errors.map((e: any) => `${e.calendar} - ${e.email}: ${e.message}`).join('\n');
          alert(`Atenção: Alguns acessos não puderam ser alterados:\n${errorMsg}`);
        }
        
        fetchCalendars();
      } else {
        throw new Error('Erro na comunicação com o servidor');
      }
    } catch (err) {
      setError('Erro ao autorizar. Certifique-se de que você fez Logout e Login novamente aceitando todas as permissões.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleLogin = async () => {
    try {
      setError(null);
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Erro ao iniciar login');
        console.error('Login error:', data);
        return;
      }
      
      window.open(data.url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      setError('Erro de conexão ao servidor. Verifique se o backend está rodando.');
      console.error('Connection error:', err);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const handleSubmit = async (e?: React.FormEvent, force: boolean = false) => {
    if (e) e.preventDefault();
    
    setSubmitting(true);
    setError(null);

    // Check for conflicts first if not forced
    if (!force) {
      try {
        console.log('Iniciando verificação de conflitos...');
        const conflictRes = await fetch('/api/calendar/check-conflicts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: formData.start,
            duration: formData.duration,
            calendarName: formData.calendarName
          }),
        });

        if (conflictRes.ok) {
          const { conflicts: foundConflicts } = await conflictRes.json();
          console.log('Conflitos encontrados:', foundConflicts);
          if (foundConflicts && foundConflicts.length > 0) {
            setConflicts(foundConflicts);
            setShowConflictModal(true);
            setSubmitting(false);
            return;
          }
        } else {
          console.error('Erro na resposta de conflitos:', await conflictRes.text());
        }
      } catch (err) {
        console.error('Erro ao verificar conflitos:', err);
      }
    }

    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          client: formData.client === 'Outros' ? formData.otherClient : formData.client
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setShowConflictModal(false);
        setConflicts([]);
        setFormData({
          calendarName: 'Navegah (Pedro)',
          client: 'Navegah',
          otherClient: '',
          title: '',
          start: getNextHour(),
          duration: 60,
          location: '',
          description: '',
          guests: '',
          team: [],
          isOnline: false,
        });
        setTimeout(() => setSuccess(false), 5000);
      } else {
        const data = await res.json();
        setError(data.error || 'Falha ao criar compromisso');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navegah-deep">
        <Loader2 className="w-8 h-8 text-navegah-lime animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-navegah-deep">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center space-y-12"
        >
          <div className="flex justify-center">
            <NavegahLogo className="scale-150" />
          </div>
          
          <div className="space-y-4">
            <p className="text-navegah-grey/80">Autonomia para a tripulação agendar compromissos</p>
            
            {user && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-4"
              >
                <button
                  onClick={authorizeMarluceAll}
                  disabled={isAuthorizing}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-sm font-bold text-navegah-lime hover:bg-navegah-lime/10 transition-all flex items-center justify-center gap-3 group"
                >
                  {isAuthorizing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  LIBERAR MARLUCE EM TODAS AS MINHAS AGENDAS
                </button>
                <p className="text-[10px] text-navegah-grey/60 mt-2 text-center">
                  Isso dará permissão de edição para atendimento.navegah@gmail.com em todas as agendas que você é o dono.
                </p>
              </motion.div>
            )}
          </div>

          <div className="space-y-4">
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white text-navegah-deep font-semibold py-4 px-6 rounded-2xl hover:bg-navegah-grey transition-all active:scale-95 shadow-xl"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Entrar com Google
            </button>
          </div>

          <p className="text-xs text-navegah-grey/40 uppercase tracking-widest font-medium">
            Exclusivo para o time Navegah
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navegah-deep text-white font-sans selection:bg-navegah-lime selection:text-navegah-deep">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-navegah-deep/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <NavegahLogo />
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white/5 py-1.5 pl-1.5 pr-3 rounded-full border border-white/10">
              <img src={user.picture} className="w-8 h-8 rounded-full border border-white/20" alt={user.name} />
              <span className="text-sm font-medium hidden md:block">{user.name}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 rounded-full bg-white/5 hover:bg-navegah-pink/20 hover:text-navegah-pink transition-colors border border-white/10"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Form Section */}
          <section className="space-y-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {/* Event Type & Client */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Tipo do Evento</label>
                    <select
                      required
                      className={`w-full bg-white/5 border rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 transition-all [color-scheme:dark] ${
                        calendars.length > 0 && calendars.find(c => c.summary?.trim().toLowerCase() === formData.calendarName.trim().toLowerCase()) && !calendars.find(c => c.summary?.trim().toLowerCase() === formData.calendarName.trim().toLowerCase())?.canWrite
                          ? 'border-amber-500/50 focus:ring-amber-500/50 focus:border-amber-500/50'
                          : 'border-white/10 focus:ring-navegah-lime/50 focus:border-navegah-lime/50'
                      }`}
                      value={formData.calendarName}
                      onChange={e => setFormData({ ...formData, calendarName: e.target.value })}
                    >
                      <option value="" disabled>Selecione o tipo</option>
                      {EVENT_TYPES.map(type => {
                        const cal = calendars.find(c => c.summary?.trim().toLowerCase() === type.toLowerCase());
                        const isReadOnly = cal && !cal.canWrite;
                        return (
                          <option key={type} value={type}>
                            {type} {isReadOnly ? '⚠️ (Apenas Leitura)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {calendars.length > 0 && formData.calendarName && (
                      (() => {
                        const cal = calendars.find(c => 
                          c.summary?.trim().toLowerCase() === formData.calendarName.trim().toLowerCase() ||
                          (formData.calendarName === 'Navegah (Pedro)' && c.primary)
                        );
                        
                        if (cal && !cal.canWrite) {
                          return (
                            <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                              <AlertCircle size={10} />
                              Você não tem permissão para gravar nesta agenda.
                            </p>
                          );
                        }
                        
                        if (cal && cal.accessRole === 'owner') {
                          return (
                            <div className="flex flex-wrap gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => authorizeTeam()}
                                disabled={isAuthorizing}
                                className="text-[10px] font-bold text-navegah-lime hover:text-white transition-colors flex items-center gap-1 bg-navegah-lime/10 px-2 py-1 rounded-md"
                              >
                                {isAuthorizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck size={12} />}
                                Autorizar Time Todo
                              </button>
                              <button
                                type="button"
                                onClick={() => authorizeTeam('atendimento.navegah@gmail.com')}
                                disabled={isAuthorizing}
                                className="text-[10px] font-bold text-white hover:text-navegah-lime transition-colors flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md border border-white/10"
                              >
                                {isAuthorizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users size={12} />}
                                Forçar Acesso: Marluce
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })()
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Cliente</label>
                    <select
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all [color-scheme:dark]"
                      value={formData.client}
                      onChange={e => setFormData({ ...formData, client: e.target.value })}
                    >
                      <option value="" disabled>Selecione o cliente</option>
                      {CLIENTS.map(client => (
                        <option key={client} value={client}>{client}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Other Client Input */}
                {formData.client === 'Outros' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Nome do Cliente (Outros)</label>
                    <input
                      required
                      type="text"
                      placeholder="Digite o nome do cliente"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all placeholder:text-white/20"
                      value={formData.otherClient}
                      onChange={e => setFormData({ ...formData, otherClient: e.target.value })}
                    />
                  </motion.div>
                )}

                {/* Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Título do Evento</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Reunião de Planejamento"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all placeholder:text-white/20"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* Date & Time */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Data e Horário
                    </label>
                    <button
                      type="button"
                      onClick={suggestNextSlot}
                      disabled={isSuggesting}
                      className="text-[10px] font-bold text-navegah-lime hover:text-white transition-colors flex items-center gap-1 bg-navegah-lime/10 px-2 py-1 rounded-md"
                    >
                      {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Sugerir Próximo Livre
                    </button>
                  </div>
                  
                  <div className="grid sm:grid-cols-[1fr_200px] gap-4">
                    <input
                      required
                      type="datetime-local"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all [color-scheme:dark]"
                      value={formData.start}
                      onChange={e => setFormData({ ...formData, start: e.target.value })}
                    />
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all [color-scheme:dark]"
                      value={formData.duration}
                      onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                    >
                      {DURATIONS.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickTime('now')}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-navegah-grey/60 hover:border-navegah-lime/30 hover:text-navegah-lime transition-all"
                    >
                      Agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickTime('today_afternoon')}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-navegah-grey/60 hover:border-navegah-lime/30 hover:text-navegah-lime transition-all"
                    >
                      Hoje 14:00
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickTime('tomorrow_morning')}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-navegah-grey/60 hover:border-navegah-lime/30 hover:text-navegah-lime transition-all"
                    >
                      Amanhã 09:00
                    </button>
                  </div>
                </div>

                {/* Meeting Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Tipo de Compromisso</label>
                  <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isOnline: false })}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${!formData.isOnline ? 'bg-navegah-lime text-navegah-deep shadow-lg' : 'text-navegah-grey/60 hover:text-white'}`}
                    >
                      Presencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isOnline: true })}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${formData.isOnline ? 'bg-navegah-lime text-navegah-deep shadow-lg' : 'text-navegah-grey/60 hover:text-white'}`}
                    >
                      Online
                    </button>
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Local
                  </label>
                  <input
                    type="text"
                    placeholder={formData.isOnline ? 'Google Meet' : 'Escritório ou Cliente'}
                    disabled={formData.isOnline}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all placeholder:text-white/20 disabled:opacity-50"
                    value={formData.isOnline ? 'Google Meet' : formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                {/* Team Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4" /> Time Navegah
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TEAM_MEMBERS.map(member => (
                      <button
                        key={member.email}
                        type="button"
                        onClick={() => {
                          const isSelected = formData.team.includes(member.email);
                          if (isSelected) {
                            setFormData({ ...formData, team: formData.team.filter(e => e !== member.email) });
                          } else {
                            setFormData({ ...formData, team: [...formData.team, member.email] });
                          }
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${formData.team.includes(member.email) ? 'bg-navegah-lime border-navegah-lime text-navegah-deep' : 'bg-white/5 border-white/10 text-navegah-grey/60 hover:border-white/20'}`}
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* External Guests */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4" /> Convidados Externos
                  </label>
                  <textarea
                    placeholder="email1@cliente.com.br, email2@cliente.com.br"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all placeholder:text-white/20 min-h-[80px] resize-none"
                    value={formData.guests}
                    onChange={e => setFormData({ ...formData, guests: e.target.value })}
                  />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-navegah-pink/10 border border-navegah-pink/20 text-navegah-pink p-4 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">{error}</span>
                  </motion.div>
                )}

                {success && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-navegah-lime/10 border border-navegah-lime/20 text-navegah-lime p-4 rounded-xl flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">Compromisso criado com sucesso!</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                disabled={submitting}
                type="submit"
                className="w-full bg-navegah-lime text-navegah-deep font-bold py-4 px-6 rounded-2xl hover:bg-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-navegah-lime/10 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Criar Compromisso
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-white/5 text-center">
        <p className="text-xs text-navegah-grey/40 uppercase tracking-[0.2em] font-medium">
          Desenvolvido com 💚 pela Navegah
        </p>
      </footer>

      {/* Conflict Modal */}
      <AnimatePresence>
        {showConflictModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConflictModal(false)}
              className="absolute inset-0 bg-navegah-deep/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-navegah-deep border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-4 text-navegah-pink">
                <div className="p-3 bg-navegah-pink/10 rounded-2xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Conflito de Horário</h3>
                  <p className="text-sm text-navegah-grey/60">Já existem compromissos neste horário.</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-navegah-grey/40 uppercase tracking-widest">Compromissos Encontrados:</p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {conflicts.map((conflict, idx) => (
                    <div key={idx} className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-semibold text-white">{conflict.summary}</p>
                      </div>
                      <p className="text-[10px] text-navegah-grey/60 mb-2">
                        {new Date(conflict.start.dateTime || conflict.start.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                        {new Date(conflict.end.dateTime || conflict.end.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {conflict.attendees && conflict.attendees.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <p className="text-[8px] font-bold text-navegah-grey/40 uppercase tracking-widest mb-1">Participantes:</p>
                          <div className="flex flex-wrap gap-1">
                            {conflict.attendees
                              .map((attendee: any) => TEAM_MEMBERS.find(m => m.email === attendee.email)?.name)
                              .filter(Boolean)
                              .map((name: string, aIdx: number) => (
                                <span key={aIdx} className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-navegah-grey/80 border border-white/10">
                                  {name}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleSubmit(undefined, true)}
                  disabled={submitting}
                  className="w-full bg-navegah-lime text-navegah-deep font-bold py-4 rounded-2xl hover:bg-white transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Agendar Assim Mesmo'}
                </button>
                <button
                  onClick={() => setShowConflictModal(false)}
                  className="w-full bg-white/5 text-white font-bold py-4 rounded-2xl hover:bg-white/10 transition-all active:scale-[0.98]"
                >
                  Cancelar e Ajustar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavegahLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src="https://antigo.navegah.com.br/assets/images/admin/logo2022.svg" 
        alt="Navegah Logo" 
        className="h-8 w-auto"
        referrerPolicy="no-referrer"
      />
      <div className="flex items-center gap-2 text-white/25 font-bold tracking-[0.1em] text-sm">
        <span>|</span>
        <span>AGENDA</span>
      </div>
    </div>
  );
}
