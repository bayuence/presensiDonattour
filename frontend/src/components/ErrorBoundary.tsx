import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: 500,
            width: '100%',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
            border: '1px solid #fee2e2',
            padding: 24,
            textAlign: 'center'
          }}>
            <div style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: '#fef2f2',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}>
              <AlertTriangle size={28} color="#dc2626" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
              Terjadi Kesalahan Tampilan
            </h2>
            {this.state.error?.message?.includes('insertBefore') || this.state.error?.message?.includes('removeChild') ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 16, textAlign: 'left', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                <strong>Penyebab:</strong> Fitur Terjemahan Otomatis (Google Translate) pada browser Anda sedang aktif dan mengubah susunan elemen teks saat data diperbarui.<br />
                <span style={{ marginTop: 4, display: 'block' }}>
                  Silakan matikan Google Translate untuk situs ini di bilah atas browser (ikon terjemahan), lalu klik tombol <strong>Muat Ulang</strong> di bawah.
                </span>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                {this.state.error?.message || 'Terjadi kesalahan saat merender halaman.'}
              </p>
            )}
            {this.state.error?.stack && (
              <pre style={{
                background: '#f1f5f9',
                color: '#334155',
                padding: 12,
                borderRadius: 8,
                fontSize: 11,
                textAlign: 'left',
                overflowX: 'auto',
                maxHeight: 150,
                marginBottom: 16
              }}>
                {this.state.error.stack}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#4f46e5',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
