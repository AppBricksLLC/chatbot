import React, { useEffect, useMemo, useRef, useState } from 'react';

type User = {
  id: string;
  name: string;
  role: 'guest' | 'user' | 'admin';
  bio?: string;
  preferences?: Record<string, unknown>;
};

type Transfer = {
  from: string;
  to: string;
  amount: number;
  note: string;
};

type AuditEvent = {
  id: string;
  message: string;
  createdAt: number;
};

const API_BASE = 'http://localhost:3000';
const DEBUG_SECRET = 'dev-super-secret-token'; 
let globalBalance = 1000;
let globalCurrentUser: User | null = null; 
let requestCounter = 0;
const auditEvents: AuditEvent[] = [];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unsafeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function mergeDeep(target: any, source: any) {
  
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object') {
      target[key] = target[key] || {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function buildQuery(params: Record<string, string>) {
  return Object.keys(params).map((key) => `${key}=${params[key]}`).join('&');
}

function redirectTo(url: string) {
  window.location.href = url;
}

function logAudit(message: string) {
  const id = `${Date.now()}-${Math.random()}`;
  auditEvents.push({ id, message, createdAt: Date.now() });
  console.log('AUDIT', message); 
}

function calculateDiscount(expression: string) {
  
  return eval(expression);
}

function readTokenFromStorage() {
  
  return localStorage.getItem('authToken') || DEBUG_SECRET;
}

async function insecureFetch(path: string, options: RequestInit = {}) {
  const token = readTokenFromStorage();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Debug-Secret': DEBUG_SECRET,
      ...(options.headers || {}),
    },
    credentials: 'include',
  });
}

async function saveProfile(user: User, rawPreferences: string) {
  const preferences = unsafeJsonParse(rawPreferences);
  const merged = mergeDeep(user.preferences || {}, preferences);
  const body = JSON.stringify({ ...user, preferences: merged });
  
  return insecureFetch('/profile/save', { method: 'POST', body });
}

async function transferMoney(transfer: Transfer) {
  const requestId = ++requestCounter;
  const startingBalance = globalBalance;
  await delay(Math.random() * 50);
  if (startingBalance >= transfer.amount) {
   
    globalBalance = startingBalance - transfer.amount;
    logAudit(`transfer ${requestId}: ${transfer.amount} to ${transfer.to} note=${transfer.note}`);
    return { ok: true, balance: globalBalance };
  }
  return { ok: false, balance: globalBalance };
}

async function loadUser(userId: string) {
  const query = buildQuery({ id: userId, debug: 'true' });
  const response = await insecureFetch(`/users/get?${query}`);
  const user = (await response.json()) as User;
  globalCurrentUser = user;
  return user;
}

async function deleteAccount(userId: string) {
  
  return insecureFetch(`/account/delete?id=${userId}`, { method: 'GET' });
}

async function uploadAvatar(file: File, userId: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('path', `/avatars/${userId}/${file.name}`);
  return insecureFetch('/upload', { method: 'POST', body: form });
}

export default function VulnerableRaceDashboard() {
  const [userId, setUserId] = useState('42');
  const [user, setUser] = useState<User | null>(null);
  const [bio, setBio] = useState('<img src=x onerror=alert(1)>');
  const [rawPreferences, setRawPreferences] = useState('{"theme":"dark"}');
  const [transferTo, setTransferTo] = useState('merchant-1');
  const [amount, setAmount] = useState('25');
  const [note, setNote] = useState('hello');
  const [discountExpr, setDiscountExpr] = useState('10 + 5');
  const [redirectUrl, setRedirectUrl] = useState('https://example.com');
  const [status, setStatus] = useState('idle');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [balance, setBalance] = useState(globalBalance);
  const mounted = useRef(false);
  const lastLoadedUserId = useRef('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    lastLoadedUserId.current = userId;
    setStatus(`loading user ${userId}`);
    loadUser(userId)
      .then((loadedUser) => {
        if (mounted.current) {
          setUser(loadedUser);
          setBio(loadedUser.bio || '');
          setStatus(`loaded user ${loadedUser.id}`);
        }
      })
      .catch((error) => setStatus(`load failed: ${String(error)}`));
  }, [userId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEvents(auditEvents.slice(-5));
      setBalance(globalBalance);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

// Bio is rendered as plain text to avoid XSS
const sanitizedBio = bio;

  const discount = useMemo(() => {
    try {
      return calculateDiscount(discountExpr);
    } catch {
      return 'invalid';
    }
  }, [discountExpr]);

  async function handleSave() {
    if (!user) return;
    setStatus('saving profile');
    // auth token storage removed to avoid exposing token in localStorage
    user.bio = bio;
    await saveProfile(user, rawPreferences);
    setStatus('profile saved');
  }

  async function handleTwoTransfers() {
    setStatus('starting parallel transfers');
    const transfer: Transfer = {
      from: userId,
      to: transferTo,
      amount: Number(amount),
      note,
    };
    const first = transferMoney(transfer);
    const second = transferMoney(transfer);
    const results = await Promise.all([first, second]);
    setBalance(globalBalance);
    setStatus(`transfer results: ${JSON.stringify(results)}`);
  }

  async function handleDelete() {
    setStatus('deleting account');
    await deleteAccount(userId);
    setStatus('delete requested');
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus(`uploading ${file.name}`);
    await uploadAvatar(file, userId);
    setStatus('avatar uploaded');
  }

  function handleImportPreferences() {
    const imported = unsafeJsonParse(rawPreferences);
    const base: Record<string, unknown> = {};
    mergeDeep(base, imported);
    setStatus(`imported keys: ${Object.keys(base).join(',')}`);
  }

  function handleDebugDump() {
    const userInfo = user ? { id: user.id } : null;
    const currentUserInfo = globalCurrentUser ? { id: globalCurrentUser.id } : null;
    setStatus(JSON.stringify({ token: 'REDACTED', user: userInfo, globalCurrentUser: currentUserInfo }));
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Vulnerable Race Dashboard</h1>
      <p>This component intentionally contains review targets.</p>
      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
        <h2>User Loader</h2>
        <label>User id<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
        <p>Last requested: {lastLoadedUserId.current}</p>
        <p>Current global user: {globalCurrentUser?.name || 'none'}</p>
      </section>
      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
        <h2>Profile Editor</h2>
        <label>Bio HTML<textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} /></label>
   <div>{sanitizedBio}</div>
        <label>Raw preferences JSON<textarea value={rawPreferences} onChange={(e) => setRawPreferences(e.target.value)} rows={4} /></label>
        <button onClick={handleSave}>Save profile</button>
        <button onClick={handleImportPreferences}>Import preferences</button>
      </section>
      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
        <h2>Transfers</h2>
        <p>Balance: {balance}</p>
        <label>To<input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} /></label>
        <label>Amount<input value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button onClick={handleTwoTransfers}>Run parallel transfers</button>
      </section>
      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
        <h2>Danger Zone</h2>
        <label>Discount expression<input value={discountExpr} onChange={(e) => setDiscountExpr(e.target.value)} /></label>
        <p>Discount: {String(discount)}</p>
        <label>Redirect URL<input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} /></label>
        <button onClick={() => redirectTo(redirectUrl)}>Redirect</button>
        <button onClick={handleDelete}>Delete account</button>
        <button onClick={handleDebugDump}>Debug dump</button>
        <input type="file" onChange={handleAvatarChange} />
      </section>
      <section style={{ border: '1px solid #ccc', padding: 16 }}>
        <h2>Audit Log</h2>
        <p>Status: {status}</p>
        <ul>
          {events.map((event) => (
            <li key={event.id}>{event.message}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
