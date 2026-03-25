import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useGoogleClientId } from '../hooks/use-config.ts';
import { api, ApiError } from '../api/client.ts';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const googleClientId = useGoogleClientId();

  if (!googleClientId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <LoginContent />
    </GoogleOAuthProvider>
  );
}

function LoginContent() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (idToken: string) => {
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/login', { id_token: idToken });
      navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/pipe-logo.png" alt="Pipe" className="h-[256px] w-[256px]" />
        </div>
        <div className="space-y-4">
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          {loading ? (
            <p className="text-sm text-gray-400 text-center">Signing in...</p>
          ) : (
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={(response) => {
                  if (response.credential) {
                    handleGoogleSuccess(response.credential);
                  }
                }}
                onError={() => setError('Google sign-in failed')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
