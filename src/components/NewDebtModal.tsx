import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  AlertTriangle,
  Check,
  UserPlus,
  Receipt,
  Info,
  Send,
  Smartphone,
  UserCheck,
  Clock,
  RotateCcw,
  CheckCircle2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Store,
  FileCheck2,
  MessageSquare,
  Sparkles,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import {
  Debt,
  Client,
  Seller,
  DebtItem,
  ConfirmationMode,
  AuditEntry,
  CompanySettings,
  AuthUser,
} from '../types/debt';
import { formatKwanza, formatDate } from '../utils/formatters';
import { resolveSystemLogo } from '../data/initialData';

interface NewDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newDebt: Omit<Debt, 'id' | 'payments' | 'createdAt' | 'updatedAt'>) => void;
  clients: Client[];
  sellers: Seller[];
  debts: Debt[];
  company?: CompanySettings;
  currentUser?: AuthUser | null;
  initialClientId?: string;
  onOpenNewClient: () => void;
}

function addDaysToIso(baseIso: string, days: number): string {
  const parts = baseIso ? baseIso.split('-').map(Number) : [];
  const d =
    parts.length === 3 && !parts.some(Number.isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getEndOfMonthIso(baseIso: string): string {
  const parts = baseIso ? baseIso.split('-').map(Number) : [];
  const base =
    parts.length === 3 && !parts.some(Number.isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date();
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const day = String(end.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDaysBetweenIso(startIso: string, endIso: string): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

export const NewDebtModal: React.FC<NewDebtModalProps> = ({
  isOpen,
  onClose,
  onSave,
  clients,
  sellers,
  company,
  currentUser,
  initialClientId,
  onOpenNewClient,
}) => {
  // Wizard Stages:
  // 1 = Registo de Produtos, Cliente e Prazos
  // 2 = Conferência da Compra pelo Cliente & Envio de SMS
  // 3 = Introdução do Código de Confirmação (Modalidade A ou B)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [clientId, setClientId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+244 923 000 000');
  const [sellerId, setSellerId] = useState('');
  const [storeName, setStoreName] = useState(company?.name || 'KwanzaCobro Loja Principal');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethodAgreed, setPaymentMethodAgreed] = useState<string>('multicaixa_express');
  const [terms, setTerms] = useState('');
  const [autoReminderEnabled, setAutoReminderEnabled] = useState<boolean>(true);
  const [guaranteeType, setGuaranteeType] = useState('Confirmação por SMS com Comprovativo Digital');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');

  // Products Table
  const [items, setItems] = useState<
    Array<{ id: string; description: string; quantity: number; unitPrice: number }>
  >([
    { id: '1', description: 'Arroz 25 kg', quantity: 2, unitPrice: 15000 },
    { id: '2', description: 'Óleo alimentar', quantity: 2, unitPrice: 5000 },
    { id: '3', description: 'Açúcar 5 kg', quantity: 2, unitPrice: 5000 },
  ]);

  // SMS Verification State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string>('');
  const [smsStatus, setSmsStatus] = useState<string>('');
  const [smsMessage, setSmsMessage] = useState<string>('');
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [whatsappSentStatus, setWhatsappSentStatus] = useState<boolean>(false);
  const [isSendingSMS, setIsSendingSMS] = useState<boolean>(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Code input mode: Modalidade A (Pessoal pelo cliente) vs Modalidade B (Assistida pelo funcionário)
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>('pessoal');
  const [assistedConsentGiven, setAssistedConsentGiven] = useState<boolean>(false);

  // 6 digit code input
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer & Attempts
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);

  // Initialize defaults on modal open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`;
      setIssueDate(todayIso);
      setDueDate(addDaysToIso(todayIso, 15));

      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      setInvoiceNumber(`FT ${today.getFullYear()}/${randomSeq}`);

      if (initialClientId) {
        const matchedClient = clients.find(c => c.id === initialClientId);
        if (matchedClient) {
          setClientId(matchedClient.id);
          setCustomerName(matchedClient.name);
          setCustomerPhone(matchedClient.phone || '+244 923 000 000');
        }
      } else {
        setClientId('');
        setCustomerName('');
        setCustomerPhone('+244 923 000 000');
      }

      if (currentUser?.role === 'vendedor') {
        const matchingSeller = sellers.find(
          s =>
            s.id === currentUser.id ||
            (currentUser.sellerId && s.id === currentUser.sellerId) ||
            s.name === currentUser.name
        );
        setSellerId(matchingSeller?.id || currentUser.sellerId || currentUser.id);
      } else if (sellers.length > 0 && !sellerId) {
        setSellerId(sellers[0].id);
      } else if (!sellerId && currentUser) {
        setSellerId(currentUser.id);
      }
      if (company?.name) {
        setStoreName(company.name);
      }
      setSessionId(null);
      setSandboxCode(null);
      setGeneratedCode('');
      setWhatsappSentStatus(false);
      setErrorMessage(null);
      setWarningMessage(null);
      setAssistedConsentGiven(false);
      setCodeDigits(['', '', '', '', '', '']);
      setSecondsRemaining(300);
      setAttemptsRemaining(5);
      setIsExpired(false);
      setIsBlocked(false);
    }
  }, [isOpen, sellers, company, currentUser, initialClientId, clients]);

  // Timer countdown
  useEffect(() => {
    if (currentStep === 3 && secondsRemaining > 0 && !isExpired && !isBlocked) {
      const timer = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            setIsExpired(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentStep, secondsRemaining, isExpired, isBlocked]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  if (!isOpen) return null;

  // Selected client autofill
  const handleSelectClient = (id: string) => {
    setClientId(id);
    const selected = clients.find(c => c.id === id);
    if (selected) {
      setCustomerName(selected.name);
      setCustomerPhone(selected.phone);
    }
  };

  // Quick due date helpers
  const handleQuickDueDate = (days: number) => {
    setDueDate(addDaysToIso(issueDate, days));
  };

  const handleEndOfMonth = () => {
    setDueDate(getEndOfMonthIso(issueDate));
  };

  // Items table calculations
  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([...items, { id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const totalCalculated = items.reduce((sum, item) => {
    const q = Number(item.quantity) || 0;
    const p = Number(item.unitPrice) || 0;
    return sum + q * p;
  }, 0);

  const termDays = getDaysBetweenIso(issueDate, dueDate);
  const due7 = addDaysToIso(issueDate, 7);
  const due15 = addDaysToIso(issueDate, 15);
  const due30 = addDaysToIso(issueDate, 30);
  const dueEom = getEndOfMonthIso(issueDate);

  // Masked phone formatting for quick preview (e.g., +244 923 ••• •20)
  const getLocalMaskedPhone = (phone: string) => {
    const clean = phone.replace(/\s+/g, '');
    if (clean.length < 7) return phone;
    const start = clean.slice(0, Math.min(7, clean.length - 4));
    const end = clean.slice(-2);
    return `${start} ••• •${end}`;
  };

  // Step 1 Validation & Proceed to Step 2 (Conferência)
  const handleProceedToReview = () => {
    setErrorMessage(null);
    if (!customerName.trim()) {
      setErrorMessage('Por favor, indique o nome completo do cliente.');
      return;
    }
    const digitsOnly = customerPhone.replace(/\D/g, '');
    if (digitsOnly.length < 9) {
      setErrorMessage('Por favor, indique um número de telefone angolano válido (mínimo 9 dígitos).');
      return;
    }
    if (!sellerId) {
      setErrorMessage('Por favor, selecione o funcionário/vendedor responsável.');
      return;
    }
    if (!dueDate) {
      setErrorMessage('A data limite de pagamento (prazo da dívida) é obrigatória.');
      return;
    }
    if (totalCalculated <= 0) {
      setErrorMessage('O valor total da dívida deve ser superior a 0 Kz. Adicione produtos com quantidade e preço.');
      return;
    }

    setMaskedPhone(getLocalMaskedPhone(customerPhone));
    setCurrentStep(2);
  };

  // Step 2: Trigger SMS dispatch via real backend
  const handleSendConfirmationSMS = async () => {
    setIsSendingSMS(true);
    setErrorMessage(null);
    setWarningMessage(null);

    const debtItems: DebtItem[] = items.map(item => ({
      id: item.id,
      description: item.description.trim() || 'Mercadoria Comercial a Crédito',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
    }));

    try {
      const resp = await fetch('/api/sms/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          storeName: storeName.trim(),
          totalAmount: totalCalculated,
          items: debtItems,
          invoiceNumber: invoiceNumber.trim(),
          sellerName: sellers.find(s => s.id === sellerId)?.name || 'Operador',
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Falha ao processar envio de código SMS.');
      }

      const returnedCode = data.verificationCode || data.sandboxTestCode || '';
      setGeneratedCode(returnedCode);
      setSandboxCode(returnedCode);
      setSessionId(data.sessionId);
      setMaskedPhone(data.maskedPhone || getLocalMaskedPhone(customerPhone));
      setSmsStatus(data.smsStatus);
      setSmsMessage(data.message);
      setSecondsRemaining(data.expiresInSeconds || 300);
      setAttemptsRemaining(5);
      setIsExpired(false);
      setIsBlocked(false);
      setResendCooldown(30);
      setCodeDigits(['', '', '', '', '', '']);

      if (data.warning) {
        setWarningMessage(data.warning);
      }

      setCurrentStep(3);
      setTimeout(() => {
        digitInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro de comunicação ao enviar código.');
    } finally {
      setIsSendingSMS(false);
    }
  };

  // Step 2 & 3: Disparo manual via WhatsApp do cliente cadastrado com código idêntico
  const handleSendCodeViaWhatsApp = async () => {
    setIsSendingSMS(true);
    setErrorMessage(null);
    let codeToUse: string = generatedCode || sandboxCode || '';

    try {
      if (!codeToUse) {
        const debtItems: DebtItem[] = items.map(item => ({
          id: item.id,
          description: item.description.trim() || 'Mercadoria Comercial a Crédito',
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
        }));

        const resp = await fetch('/api/sms/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            storeName: storeName.trim(),
            totalAmount: totalCalculated,
            items: debtItems,
            invoiceNumber: invoiceNumber.trim(),
            sellerName: sellers.find(s => s.id === sellerId)?.name || 'Operador',
          }),
        });
        const data = await resp.json();
        codeToUse = String(
          data.verificationCode || data.sandboxTestCode || Math.floor(100000 + Math.random() * 900000)
        );
        setSessionId(data.sessionId);
        setMaskedPhone(data.maskedPhone || getLocalMaskedPhone(customerPhone));
        setGeneratedCode(codeToUse);
        setSandboxCode(codeToUse);
        setSecondsRemaining(data.expiresInSeconds || 300);
      }
    } catch {
      if (!codeToUse) {
        codeToUse = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedCode(codeToUse);
      }
    } finally {
      setIsSendingSMS(false);
    }

    const sellerNameObj = sellers.find(s => s.id === sellerId)?.name || 'Vendedor Comercial';
    const store = storeName || company?.name || 'KwanzaCobro';
    const totalFmt = formatKwanza(totalCalculated);
    const invoiceNum = invoiceNumber.trim() || `FT ${new Date().getFullYear()}`;

    const itemsSummary = items
      .map(
        it =>
          `• ${it.description || 'Produto'} (${it.quantity} un) - ${formatKwanza(
            (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)
          )}`
      )
      .join('\n');

    const message = `*KWANZACOBRO · CONFIRMAÇÃO DE COMPRA A CRÉDITO*
Olá, *${customerName.trim()}*!

Foi registada uma compra a crédito na loja *${store}* com o funcionário *${sellerNameObj}*.

💰 *Valor Total da Dívida:* *${totalFmt}*
📅 *Data Limite de Pagamento:* *${dueDate}*
📄 *Fatura:* ${invoiceNum}

🔐 *O SEU CÓDIGO DE CONFIRMAÇÃO É:* *${codeToUse}*
_Este código consta oficialmente no seu Recibo da KwanzaCobro para reconhecimento da dívida._

📦 *Produtos Adquiridos:*
${itemsSummary}

*KwanzaCobro* · Gestão Inteligente de Dívidas`;

    let cleanPhone = customerPhone.replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '');
    if (cleanPhone.length === 9 && (cleanPhone.startsWith('9') || cleanPhone.startsWith('2'))) {
      cleanPhone = `244${cleanPhone}`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    setWhatsappSentStatus(true);
    setCurrentStep(3);
  };

  // Preenchimento com 1 clique do código gerado no ecrã
  const handleAutofillCode = () => {
    const code = generatedCode || sandboxCode;
    if (!code || code.length !== 6) return;
    setCodeDigits(code.split(''));
  };

  // Gravação Direta / Opcional sem validação rígida de código
  const handleSkipVerificationAndSave = () => {
    const debtItems: DebtItem[] = items.map(item => ({
      id: item.id,
      description: item.description.trim() || 'Mercadoria Comercial a Crédito',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
    }));

    const finalCode = generatedCode || sandboxCode || undefined;

    onSave({
      invoiceNumber: invoiceNumber.trim() || `FT 2026/${Math.floor(1000 + Math.random() * 9000)}`,
      clientId: clientId || `cli-quick-${Date.now()}`,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      sellerId,
      issueDate: issueDate || new Date().toISOString().slice(0, 10),
      dueDate,
      totalAmount: totalCalculated,
      items: debtItems,
      status: 'aberta',
      paymentMethodAgreed,
      terms,
      guaranteeType,
      guarantorName: guarantorName.trim() || undefined,
      guarantorPhone: guarantorPhone.trim() || undefined,
      autoReminderEnabled,
      reminder5DaysSent: false,
      confirmationStatus: finalCode ? 'confirmada' : 'sem_sms',
      confirmationMode,
      confirmationCode: finalCode,
      confirmedAt: new Date().toISOString(),
      confirmationTransactionId: finalCode ? `TX-NJ-${finalCode}` : undefined,
      smsStatus: 'pendente',
      whatsappSent: whatsappSentStatus,
    });

    onClose();
  };

  // Handle individual digit input
  const handleDigitChange = (index: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = char;
    setCodeDigits(newDigits);

    if (char && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePasteCode = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setCodeDigits(newDigits);
    const nextIdx = Math.min(pasted.length, 5);
    digitInputRefs.current[nextIdx]?.focus();
  };

  const fullEnteredCode = codeDigits.join('');

  // Step 3: Verify code with backend and finalize credit registration
  const handleVerifyAndFinalize = async () => {
    if (fullEnteredCode.length !== 6) {
      setErrorMessage('Por favor, introduza os 6 dígitos do código de confirmação.');
      return;
    }

    if (confirmationMode === 'assistida' && !assistedConsentGiven) {
      setErrorMessage(
        'Na modalidade assistida, é obrigatório confirmar que o cliente autorizou a introdução do código.'
      );
      return;
    }

    if (!sessionId) {
      setErrorMessage('Sessão de confirmação inválida. Reenvie o código SMS.');
      return;
    }

    setIsVerifyingCode(true);
    setErrorMessage(null);

    try {
      const resp = await fetch('/api/sms/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          code: fullEnteredCode,
          confirmationMode,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data.isBlocked) {
          setIsBlocked(true);
        }
        if (data.isExpired) {
          setIsExpired(true);
        }
        if (typeof data.attemptsRemaining === 'number') {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        throw new Error(data.error || 'Código de confirmação incorreto.');
      }

      const debtItems: DebtItem[] = items.map(item => ({
        id: item.id,
        description: item.description.trim() || 'Mercadoria Comercial a Crédito',
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
      }));

      const auditTrail: AuditEntry[] = [
        {
          timestamp: new Date().toISOString(),
          action: 'Operação iniciada e código SMS gerado',
          performedBy: sellers.find(s => s.id === sellerId)?.name || 'Vendedor',
          details: `Código enviado para o número ${maskedPhone} da loja ${storeName}`,
        },
        {
          timestamp: data.confirmedAt || new Date().toISOString(),
          action: 'Dívida formalmente confirmada pelo cliente',
          performedBy:
            confirmationMode === 'pessoal'
              ? 'Cliente (Pessoal no Ecrã)'
              : 'Operador (Assistido com Consentimento)',
          details: `Transação ${data.transactionId} validada por SMS`,
        },
      ];

      onSave({
        invoiceNumber: invoiceNumber.trim() || `FT 2026/${Math.floor(1000 + Math.random() * 9000)}`,
        clientId: clientId || `cli-quick-${Date.now()}`,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        sellerId,
        issueDate: issueDate || new Date().toISOString().slice(0, 10),
        dueDate,
        totalAmount: totalCalculated,
        items: debtItems,
        status: 'aberta',
        paymentMethodAgreed,
        terms,
        guaranteeType,
        guarantorName: guarantorName.trim() || undefined,
        guarantorPhone: guarantorPhone.trim() || undefined,
        autoReminderEnabled,
        reminder5DaysSent: false,
        confirmationStatus: 'confirmada',
        confirmationMode,
        confirmationCode: fullEnteredCode || generatedCode || sandboxCode || undefined,
        whatsappSent: whatsappSentStatus,
        whatsappSentAt: whatsappSentStatus ? new Date().toISOString() : undefined,
        confirmedAt: data.confirmedAt,
        confirmationTransactionId: data.transactionId,
        smsStatus: smsStatus === 'sent' ? 'enviado' : 'nao_configurado',
        smsSentAt: new Date().toISOString(),
        smsMaskedPhone: maskedPhone,
        verificationQrCode: data.qrVerificationUrl,
        auditTrail,
      });

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Código de confirmação inválido.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Fallback direct registration without SMS
  const handleDirectRegistrationWithoutSMS = () => {
    if (!customerName.trim() || !dueDate || totalCalculated <= 0) {
      setErrorMessage(
        'Preencha os dados obrigatórios (cliente, prazo e produtos com valor superior a 0 Kz) antes de gravar.'
      );
      return;
    }

    const debtItems: DebtItem[] = items.map(item => ({
      id: item.id,
      description: item.description.trim() || 'Mercadoria Comercial a Crédito',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
    }));

    onSave({
      invoiceNumber: invoiceNumber.trim() || `FT 2026/${Math.floor(1000 + Math.random() * 9000)}`,
      clientId: clientId || `cli-quick-${Date.now()}`,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      sellerId,
      issueDate: issueDate || new Date().toISOString().slice(0, 10),
      dueDate,
      totalAmount: totalCalculated,
      items: debtItems,
      status: 'aberta',
      paymentMethodAgreed,
      terms,
      guaranteeType,
      guarantorName: guarantorName.trim() || undefined,
      guarantorPhone: guarantorPhone.trim() || undefined,
      autoReminderEnabled,
      reminder5DaysSent: false,
      confirmationStatus: 'sem_sms',
    });

    onClose();
  };

  const sellerNameSelected = sellers.find(s => s.id === sellerId)?.name || 'Vendedor Comercial';

  const stepsMeta = [
    { step: 1 as const, label: 'Cliente & Artigos' },
    { step: 2 as const, label: 'Conferência & Envio' },
    { step: 3 as const, label: 'Validação do Código' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-emerald-100 shadow-2xl overflow-hidden my-2 sm:my-4 flex flex-col max-h-[94vh]">
        {/* Top Header com Design do Sistema (Verde Esmeralda + Logomarca Oficial) */}
        <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white flex items-center justify-between gap-3 border-b border-emerald-500/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 px-2.5 py-1 bg-white border border-white/20 rounded-xl flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
              <img
                src={resolveSystemLogo(company?.logoUrl)}
                alt="Logomarca Oficial KwanzaCobro"
                referrerPolicy="no-referrer"
                className="h-9 w-auto max-w-[140px] sm:max-w-[155px] object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  Registo de Compra a Crédito
                </h2>
                <span className="text-[11px] font-mono font-semibold bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-md border border-emerald-400/30">
                  {invoiceNumber || 'FT'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-emerald-100/80 truncate mt-0.5">
                Preencha o cliente, artigos, data limite e confirme por SMS, WhatsApp ou registo direto
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="text-emerald-200 hover:text-white hover:bg-white/10 p-2 rounded-xl transition-colors cursor-pointer shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Intuitivo e Interativo */}
        <div className="px-4 sm:px-6 py-3 bg-emerald-50/40 border-b border-emerald-100 flex items-center justify-between gap-2 text-xs shrink-0 overflow-x-auto">
          {stepsMeta.map((item, idx) => {
            const isActive = currentStep === item.step;
            const isCompleted = currentStep > item.step;
            const canClick = isCompleted;

            return (
              <React.Fragment key={item.step}>
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => {
                    if (canClick) {
                      setErrorMessage(null);
                      setCurrentStep(item.step);
                    }
                  }}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 transition-colors ${
                    canClick ? 'cursor-pointer hover:bg-emerald-100/70' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold transition-colors ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isActive
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : item.step}
                  </span>
                  <span
                    className={`font-semibold ${
                      isActive
                        ? 'text-emerald-950 font-bold'
                        : isCompleted
                        ? 'text-emerald-800'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>

                {idx < stepsMeta.length - 1 && (
                  <div
                    className={`flex-1 min-w-[16px] h-0.5 rounded-full ${
                      currentStep > item.step ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Scrollable Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50/60">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium">{errorMessage}</div>
            </div>
          )}

          {warningMessage && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="font-medium">{warningMessage}</div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ETAPA 1: REGISTO DE PRODUTOS, CLIENTE, VENDEDOR E PRAZO */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-5">
              {/* Resumo Rápido em Tempo Real (Orientação Intuitiva) */}
              <div className="bg-white border border-emerald-200/80 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-slate-500">Cliente: </span>
                    <strong className="text-slate-900">
                      {customerName.trim() || 'Por identificar'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Prazo: </span>
                    <strong
                      className={
                        termDays !== null && termDays < 0
                          ? 'text-rose-700'
                          : 'text-emerald-800'
                      }
                    >
                      {termDays === null
                        ? 'Por definir'
                        : termDays === 0
                        ? 'Vence hoje'
                        : termDays > 0
                        ? `${termDays} ${termDays === 1 ? 'dia' : 'dias'} (${formatDate(dueDate)})`
                        : `${Math.abs(termDays)} dias em atraso`}
                    </strong>
                  </div>
                </div>

                <div className="text-right ml-auto">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-2">
                    Total
                  </span>
                  <span
                    className="text-base font-extrabold font-mono text-emerald-700"
                    data-tabular
                  >
                    {formatKwanza(totalCalculated)}
                  </span>
                </div>
              </div>

              {/* Secção 1: Identificação do Cliente e Loja */}
              <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        1. Cliente & Contacto (+244)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Escolha um cliente já registado ou preencha os dados manualmente
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenNewClient}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Cliente</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cliente Registado (rápido)
                    </label>
                    <select
                      value={clientId}
                      onChange={e => handleSelectClient(e.target.value)}
                      className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    >
                      <option value="">-- Introduzir manualmente --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome Completo do Cliente <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="Ex: Manuel Domingos da Silva"
                      className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Telefone / WhatsApp (+244) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="+244 923 000 000"
                      className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg font-mono bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Recebe o código de confirmação e lembretes de prazo
                    </span>
                  </div>
                </div>

                {/* Loja e Funcionário Responsável */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-3 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Loja / Estabelecimento Comercial
                    </label>
                    <div className="relative">
                      <Store className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={storeName}
                        onChange={e => setStoreName(e.target.value)}
                        placeholder="Ex: KwanzaCobro Luanda Centro"
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vendedor / Operador Responsável <span className="text-rose-600">*</span>
                    </label>
                    {currentUser?.role === 'vendedor' ? (
                      <div className="w-full py-2 px-3 text-xs border border-emerald-200 rounded-lg bg-emerald-50/60 text-emerald-950 font-semibold flex items-center justify-between min-h-[40px]">
                        <span>{sellers.find(s => s.id === sellerId)?.name || currentUser.name}</span>
                        <span className="text-[10px] text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded font-mono">
                          Sessão Atual
                        </span>
                      </div>
                    ) : (
                      <select
                        value={sellerId}
                        onChange={e => setSellerId(e.target.value)}
                        className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                      >
                        {sellers.length === 0 ? (
                          <option value={currentUser?.id || 'usr-admin-1'}>
                            {currentUser?.name || 'Administrador Geral'} (Operador Atual)
                          </option>
                        ) : (
                          sellers.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.branch})
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Secção 2: Discriminação Detalhada dos Produtos Adquiridos */}
              <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        2. Produtos ou Serviços a Crédito
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Os subtotais e o valor global em Kwanzas atualizam automaticamente.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addItemRow}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Produto</span>
                  </button>
                </div>

                {/* Tabela de Produtos Responsiva */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs min-w-[540px]">
                    <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 text-left">Descrição do Produto</th>
                        <th className="py-2.5 px-3 text-center w-24">Qtd</th>
                        <th className="py-2.5 px-3 text-right w-36">Preço Unit. (Kz)</th>
                        <th className="py-2.5 px-3 text-right w-36">Subtotal</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {items.map((item, index) => {
                        const q = Number(item.quantity) || 0;
                        const p = Number(item.unitPrice) || 0;
                        const subtotal = q * p;

                        return (
                          <tr key={item.id} className="hover:bg-emerald-50/20 transition-colors">
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Ex: Arroz 25 kg, Óleo alimentar..."
                                value={item.description}
                                onChange={e =>
                                  handleItemChange(index, 'description', e.target.value)
                                }
                                className="w-full py-2 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.quantity}
                                onChange={e =>
                                  handleItemChange(index, 'quantity', e.target.value)
                                }
                                className="w-full py-2 px-2 text-xs text-center border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={item.unitPrice || ''}
                                onChange={e =>
                                  handleItemChange(index, 'unitPrice', e.target.value)
                                }
                                className="w-full py-2 px-2.5 text-xs text-right border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                              />
                            </td>
                            <td
                              className="p-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap"
                              data-tabular
                            >
                              {formatKwanza(subtotal)}
                            </td>
                            <td className="p-2 text-center">
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeItemRow(index)}
                                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors p-1.5 rounded-lg cursor-pointer"
                                  title="Remover linha"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bloco de Total Dinâmico em Kz (Tema Sistema Esmeralda) */}
                <div className="bg-gradient-to-r from-emerald-950 to-slate-900 text-white rounded-xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-emerald-100/90">
                    <span className="font-bold text-white">
                      {items.length} {items.length === 1 ? 'artigo' : 'artigos'}
                    </span>
                    <span className="text-emerald-400/60 mx-2">·</span>
                    <span className="text-[11px] text-emerald-200/80">
                      Cálculo: Quantidade × Preço unitário
                    </span>
                  </div>

                  <div className="text-right ml-auto">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">
                      Total da Dívida (A Crédito)
                    </span>
                    <span
                      className="text-xl font-black font-mono text-white"
                      data-tabular
                    >
                      {formatKwanza(totalCalculated)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Secção 3: Prazos e Condições Contratuais */}
              <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      3. Prazo de Pagamento, Alerta & Condições
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Escolha a data limite rapidamente com os atalhos ou personalize no calendário
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Data de Emissão da Fatura
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={e => setIssueDate(e.target.value)}
                      className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg font-mono bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center justify-between">
                      <span>
                        Data Limite de Pagamento (Prazo) <span className="text-rose-600">*</span>
                      </span>
                      {termDays !== null && (
                        <span
                          className={`text-[11px] font-mono font-semibold ${
                            termDays < 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {termDays === 0
                            ? 'Hoje'
                            : termDays > 0
                            ? `+${termDays} dias`
                            : `${termDays} dias`}
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full py-2 px-3 text-xs border border-emerald-300 bg-white rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    />
                    {/* Atalhos Rápidos de Prazo com Destaque Ativo */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[11px] text-slate-500 mr-0.5">Atalhos:</span>
                      {[
                        { label: '+7 dias', target: due7, onClick: () => handleQuickDueDate(7) },
                        { label: '+15 dias', target: due15, onClick: () => handleQuickDueDate(15) },
                        { label: '+30 dias', target: due30, onClick: () => handleQuickDueDate(30) },
                        { label: 'Fim do mês', target: dueEom, onClick: handleEndOfMonth },
                      ].map(shortcut => {
                        const active = dueDate === shortcut.target;
                        return (
                          <button
                            key={shortcut.label}
                            type="button"
                            onClick={shortcut.onClick}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer min-h-[30px] ${
                              active
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900'
                            }`}
                          >
                            {shortcut.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Alerta de 5 dias preventivo */}
                <label
                  htmlFor="autoReminderToggle"
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    autoReminderEnabled
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Alerta Preventivo Automático (5 dias antes)
                    </span>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Notifica o cliente por WhatsApp / SMS ({customerPhone}) exatamente 5 dias antes do vencimento.
                    </p>
                  </div>
                  <input
                    id="autoReminderToggle"
                    type="checkbox"
                    checked={autoReminderEnabled}
                    onChange={e => setAutoReminderEnabled(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
                  />
                </label>

                {/* Método, Garantia e Observações */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Método de Pagamento Acordado
                    </label>
                    <select
                      value={paymentMethodAgreed}
                      onChange={e => setPaymentMethodAgreed(e.target.value)}
                      className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    >
                      <option value="multicaixa_express">Multicaixa Express</option>
                      <option value="transferencia_bancaria">Transferência Bancária (IBAN)</option>
                      <option value="tpa">TPA / Multicaixa Presencial</option>
                      <option value="dinheiro">Dinheiro Vivo (Cash)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tipo de Garantia / Acordo
                    </label>
                    <select
                      value={guaranteeType}
                      onChange={e => setGuaranteeType(e.target.value)}
                      className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[40px]"
                    >
                      <option value="Confirmação por SMS com Comprovativo Digital">
                        Confirmação por SMS com Comprovativo Digital (Recomendado)
                      </option>
                      <option value="Termo de Confissão de Dívida">Termo de Confissão de Dívida</option>
                      <option value="Acordo Verbal de Confiança">Acordo Verbal de Confiança</option>
                      <option value="Fiador Pessoal">Fiador Pessoal</option>
                    </select>
                  </div>
                </div>

                {guaranteeType === 'Fiador Pessoal' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-3.5 bg-emerald-50/40 border border-emerald-200 rounded-xl">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nome do Fiador (opcional)
                      </label>
                      <input
                        type="text"
                        value={guarantorName}
                        onChange={e => setGuarantorName(e.target.value)}
                        placeholder="Nome completo do fiador"
                        className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[38px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Telefone do Fiador (opcional)
                      </label>
                      <input
                        type="text"
                        value={guarantorPhone}
                        onChange={e => setGuarantorPhone(e.target.value)}
                        placeholder="+244 923 000 000"
                        className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[38px]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Observações / Condições Adicionais (opcional)
                  </label>
                  <input
                    type="text"
                    value={terms}
                    onChange={e => setTerms(e.target.value)}
                    placeholder="Ex: Pagamento em 2 prestações ou entrega no armazém..."
                    className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 min-h-[38px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ETAPA 2: CONFERÊNCIA DA COMPRA PELO CLIENTE & ENVIO DE CÓDIGO SMS */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-5">
              {/* Cartão de Conferência Oficial */}
              <div className="bg-white border border-emerald-200 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-3 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="p-1.5 bg-white border border-emerald-200 rounded-xl shadow-2xs shrink-0">
                      <img
                        src={resolveSystemLogo(company?.logoUrl)}
                        alt="Logomarca Oficial KwanzaCobro"
                        referrerPolicy="no-referrer"
                        className="h-10 max-w-[175px] object-contain"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 block">
                        {company?.name || 'KwanzaCobro Angola'}
                      </span>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                        Conferência da Compra a Crédito
                      </h3>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 sm:text-right">
                    <span>Mostre este resumo ao cliente antes de emitir ou enviar o código</span>
                  </div>
                </div>

                {/* Dados da Operação */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Cliente:</span>
                    <strong className="text-slate-900 text-sm block truncate">{customerName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Loja:</span>
                    <strong className="text-slate-900 block truncate">{storeName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Emissão:</span>
                    <strong className="text-slate-900 font-mono">{formatDate(issueDate)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Responsável:</span>
                    <strong className="text-slate-900 block truncate">{sellerNameSelected}</strong>
                  </div>
                </div>

                {/* Tabela de Produtos para o Cliente */}
                <div>
                  <span className="text-xs font-bold text-slate-800 block mb-2">
                    Artigos Discriminados ({items.length})
                  </span>
                  <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-xs min-w-[440px]">
                      <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-left">Produto</th>
                          <th className="py-2.5 px-3 text-center w-20">Qtd</th>
                          <th className="py-2.5 px-3 text-right w-28">Preço Unit.</th>
                          <th className="py-2.5 px-3 text-right w-28">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map(item => {
                          const q = Number(item.quantity) || 0;
                          const p = Number(item.unitPrice) || 0;
                          return (
                            <tr key={item.id}>
                              <td className="py-2.5 px-3 text-slate-800 font-medium">
                                {item.description || 'Mercadoria Comercial'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono">{q}</td>
                              <td className="py-2.5 px-3 text-right font-mono" data-tabular>
                                {formatKwanza(p)}
                              </td>
                              <td
                                className="py-2.5 px-3 text-right font-mono font-bold text-slate-900"
                                data-tabular
                              >
                                {formatKwanza(q * p)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Valor Total Destacado (Tema Esmeralda do Sistema) */}
                <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-emerald-200 block uppercase tracking-wider font-semibold">
                      Valor Total da Dívida
                    </span>
                    <div
                      className="text-2xl font-black font-mono text-white mt-0.5"
                      data-tabular
                    >
                      {formatKwanza(totalCalculated)}
                    </div>
                  </div>

                  <div className="text-right ml-auto">
                    <span className="text-[11px] text-emerald-200 block font-semibold">
                      Prazo Limite de Pagamento
                    </span>
                    <span className="text-sm font-bold font-mono text-emerald-300">
                      {formatDate(dueDate)}
                    </span>
                    {termDays !== null && (
                      <span className="text-[11px] text-emerald-100/80 block">
                        ({termDays >= 0 ? `${termDays} dias` : `${Math.abs(termDays)}d atraso`})
                      </span>
                    )}
                  </div>
                </div>

                {/* Verificação do Número do Cliente */}
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Contacto do Cliente (+244)
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-900">
                        {customerPhone} · ({maskedPhone})
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Corrigir Dados
                  </button>
                </div>

                {/* Opções de Envio e Confirmação */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 block">
                      Como pretende concluir esta compra a crédito?
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      O envio de código é opcional
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Opção 1: SMS */}
                    <button
                      type="button"
                      disabled={isSendingSMS}
                      onClick={handleSendConfirmationSMS}
                      className="p-3.5 text-left border border-emerald-500 hover:border-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 rounded-xl transition-all cursor-pointer disabled:opacity-60"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-950 mb-1">
                        <Send className="w-4 h-4 text-emerald-700" />
                        <span>1. Enviar Código por SMS</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Gera e envia o código de 6 dígitos para confirmação pelo cliente.
                      </p>
                    </button>

                    {/* Opção 2: WhatsApp */}
                    <button
                      type="button"
                      disabled={isSendingSMS}
                      onClick={handleSendCodeViaWhatsApp}
                      className="p-3.5 text-left border border-emerald-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 rounded-xl transition-all cursor-pointer disabled:opacity-60"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900 mb-1">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>2. Enviar via WhatsApp</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Abre o WhatsApp do cliente com resumo completo e código oficial.
                      </p>
                    </button>

                    {/* Opção 3: Gravar sem Código */}
                    <button
                      type="button"
                      onClick={handleDirectRegistrationWithoutSMS}
                      className="p-3.5 text-left border border-slate-200 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-slate-600" />
                        <span>3. Gravar sem Código</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Regista a dívida de imediato caso o cliente esteja sem telemóvel.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ETAPA 3: INTRODUÇÃO DO CÓDIGO PELO CLIENTE (MODALIDADE A E B) */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-5">
              {/* Código Gerado & Ações Rápidas */}
              <div className="p-4 sm:p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs shrink-0">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                      Código Gerado para o Comprovativo
                    </span>
                    <div
                      className="text-2xl font-black font-mono tracking-widest text-slate-900 mt-0.5"
                      data-tabular
                    >
                      {generatedCode || sandboxCode || '------'}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Sincronizado com o recibo em PDF e envio por WhatsApp (+244).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAutofillCode}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors shadow-2xs cursor-pointer min-h-[38px]"
                    title="Preenche automaticamente os 6 dígitos nas caixas abaixo"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Preencher Código</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendCodeViaWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-2xs cursor-pointer min-h-[38px]"
                    title="Partilhar este código pelo WhatsApp do cliente"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Enviar WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Informação de entrega */}
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5 text-slate-700">
                  <div className="font-semibold text-slate-900">
                    {smsMessage || 'Código de confirmação ativo para esta operação.'}
                  </div>
                  <div>
                    Destinatário: <strong className="font-mono">{maskedPhone}</strong> · Cliente:{' '}
                    <strong>{customerName}</strong>
                  </div>
                </div>
              </div>

              {/* Seletor de Modalidade: A (Pessoal) vs B (Assistida) */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-900 block">
                  Modalidade de Introdução do Código:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmationMode('pessoal')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      confirmationMode === 'pessoal'
                        ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Smartphone
                          className={`w-4 h-4 ${
                            confirmationMode === 'pessoal' ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        />
                        <strong className="text-xs text-slate-900">
                          Modalidade A: Cliente Digita
                        </strong>
                      </div>
                      {confirmationMode === 'pessoal' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600">
                      O cliente introduz diretamente o código de 6 dígitos no ecrã.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmationMode('assistida')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      confirmationMode === 'assistida'
                        ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <UserCheck
                          className={`w-4 h-4 ${
                            confirmationMode === 'assistida'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        />
                        <strong className="text-xs text-slate-900">
                          Modalidade B: Assistida
                        </strong>
                      </div>
                      {confirmationMode === 'assistida' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600">
                      O cliente dita o código ao funcionário mediante consentimento expresso.
                    </p>
                  </button>
                </div>
              </div>

              {/* Declaração obrigatória para Modalidade B */}
              {confirmationMode === 'assistida' && (
                <label
                  htmlFor="assistedConsent"
                  className={`block p-3.5 rounded-xl border text-xs space-y-1.5 cursor-pointer transition-colors ${
                    assistedConsentGiven
                      ? 'bg-emerald-50/70 border-emerald-300'
                      : 'bg-white border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="assistedConsent"
                      checked={assistedConsentGiven}
                      onChange={e => setAssistedConsentGiven(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-slate-900">
                      Declaração de Consentimento Verbal do Cliente
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 pl-6 leading-relaxed">
                    Declaro que o(a) cliente <strong>{customerName}</strong> conferiu o valor de{' '}
                    <strong className="font-mono">{formatKwanza(totalCalculated)}</strong> e autorizou a introdução assistida do código recebido.
                  </p>
                </label>
              )}

              {/* Painel do Código de 6 Dígitos */}
              <div className="border border-slate-200 rounded-2xl p-5 sm:p-6 text-center space-y-5 bg-white">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Validação de 6 Dígitos</span>
                  </span>
                  <h4 className="text-base font-extrabold text-slate-900 mt-1">
                    Introduza o Código de Confirmação
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Válido por 5 minutos · Máximo de 5 tentativas
                  </p>
                </div>

                {/* 6 Digit Input Boxes */}
                <div
                  className="flex items-center justify-center gap-2 sm:gap-3"
                  onPaste={handlePasteCode}
                >
                  {codeDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={el => {
                        digitInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      disabled={isExpired || isBlocked}
                      value={digit}
                      onChange={e => handleDigitChange(idx, e.target.value)}
                      onKeyDown={e => handleDigitKeyDown(idx, e)}
                      className={`w-11 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-mono font-black border-2 rounded-xl focus:outline-none transition-all ${
                        isBlocked
                          ? 'border-rose-300 bg-rose-50 text-rose-700 cursor-not-allowed'
                          : isExpired
                          ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                          : digit
                          ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 shadow-2xs'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      }`}
                    />
                  ))}
                </div>

                {/* Status Bar: Tempo Restante & Tentativas */}
                <div className="flex flex-wrap items-center justify-center gap-5 text-xs pt-1">
                  <div className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Clock
                      className={`w-4 h-4 ${
                        secondsRemaining < 60 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    />
                    <span>Tempo restante:</span>
                    <strong
                      className={`font-mono text-sm ${
                        secondsRemaining < 60 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                      data-tabular
                    >
                      {Math.floor(secondsRemaining / 60)}:
                      {(secondsRemaining % 60).toString().padStart(2, '0')}
                    </strong>
                  </div>

                  <div className="w-px h-4 bg-slate-200" />

                  <div className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span>Tentativas restantes:</span>
                    <strong
                      className={`font-mono text-sm ${
                        attemptsRemaining <= 2 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                      data-tabular
                    >
                      {attemptsRemaining} de 5
                    </strong>
                  </div>
                </div>

                {isBlocked && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
                    Tentativas esgotadas por segurança. Gere um novo código SMS abaixo para continuar.
                  </div>
                )}

                {isExpired && !isBlocked && (
                  <div className="p-3 bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold">
                    O prazo de 5 minutos expirou. Clique em "Reenviar Novo Código SMS" para gerar outro código.
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    disabled={isSendingSMS || resendCooldown > 0}
                    onClick={handleSendConfirmationSMS}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 disabled:text-slate-400 py-1.5 px-3 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {resendCooldown > 0
                        ? `Aguarde ${resendCooldown}s para reenviar`
                        : 'Reenviar Novo Código SMS'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => (prev === 3 ? 2 : 1))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[40px]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>
            )}

            {currentStep === 1 && (
              <button
                type="button"
                onClick={handleDirectRegistrationWithoutSMS}
                className="text-xs font-semibold text-slate-500 hover:text-emerald-800 underline cursor-pointer py-2"
                title="Registar diretamente sem enviar código SMS"
              >
                Gravar sem SMS
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer min-h-[40px]"
            >
              Cancelar
            </button>

            {/* Step 1: Avançar para Conferência */}
            {currentStep === 1 && (
              <button
                type="button"
                onClick={handleProceedToReview}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 rounded-xl shadow-xs transition-all cursor-pointer min-h-[40px]"
              >
                <span>Conferir Compra</span>
                <ArrowRight className="w-4 h-4 text-emerald-200" />
              </button>
            )}

            {/* Step 2: Opções de Envio e Gravação Opcional */}
            {currentStep === 2 && (
              <>
                <button
                  type="button"
                  onClick={handleDirectRegistrationWithoutSMS}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[40px]"
                  title="Grava a dívida diretamente sem envio de código"
                >
                  Gravar sem Código
                </button>

                <button
                  type="button"
                  disabled={isSendingSMS}
                  onClick={handleSendCodeViaWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors disabled:opacity-50 cursor-pointer min-h-[40px]"
                  title="Abre o WhatsApp com o resumo e o código"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  disabled={isSendingSMS}
                  onClick={handleSendConfirmationSMS}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer min-h-[40px]"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-200" />
                  <span>{isSendingSMS ? 'A Enviar SMS...' : 'Enviar Código SMS'}</span>
                </button>
              </>
            )}

            {/* Step 3: Validar Código ou Gravar sem Validar (Opcional) */}
            {currentStep === 3 && (
              <>
                <button
                  type="button"
                  onClick={handleSkipVerificationAndSave}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[40px]"
                  title="Grava a dívida com o código associado sem obrigar à digitação dos 6 dígitos"
                >
                  Gravar sem Validar
                </button>

                <button
                  type="button"
                  disabled={
                    isVerifyingCode ||
                    fullEnteredCode.length !== 6 ||
                    isExpired ||
                    isBlocked
                  }
                  onClick={handleVerifyAndFinalize}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed min-h-[40px]"
                >
                  <FileCheck2 className="w-4 h-4 text-emerald-200" />
                  <span>
                    {isVerifyingCode
                      ? 'A Validar...'
                      : 'Confirmar & Emitir Comprovativo'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
