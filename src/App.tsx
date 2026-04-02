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
  ChevronRight
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
    calendarName: 'Navegah (Pedro)',
    client: 'Navegah',
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
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Erro ao iniciar login');
        return;
      }
      
      window.open(data.url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      setError('Erro de conexão ao servidor');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setSubmitting(true);
    setError(null);

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
        setFormData({
          calendarName: 'Navegah (Pedro)',
          client: 'Navegah',
          otherClient: '',
          title: '',
          start: '',
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
          
          <div className="space-y-2">
            <p className="text-navegah-grey/80">Autonomia para a tripulação agendar compromissos</p>
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
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Novo Compromisso</h2>
              <p className="text-navegah-grey/60">Preencha os detalhes para inserir na agenda da Navegah.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {/* Event Type & Client */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Tipo do Evento</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all [color-scheme:dark]"
                      value={formData.calendarName}
                      onChange={e => setFormData({ ...formData, calendarName: e.target.value })}
                    >
                      {EVENT_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-navegah-grey/80 uppercase tracking-wider">Cliente</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-navegah-lime/50 focus:border-navegah-lime/50 transition-all [color-scheme:dark]"
                      value={formData.client}
                      onChange={e => setFormData({ ...formData, client: e.target.value })}
                    >
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
          Navegah &copy; 2026 • Design & Tecnologia
        </p>
      </footer>
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
