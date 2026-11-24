import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { User, ArrowRight } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useAuth } from '@/contexts/AuthContext';
import { upsertProfile } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import type { ProfileFormData } from '@/types';

const genderOptions = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const languageOptions = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Urdu'];

export default function ProfilePage() {
  const { user, profile, refreshProfile, loading: authLoading, onboardingLoading } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [form, setForm] = useState<ProfileFormData>({
    // New Google accounts: suggest the name from Google (saved only when the user submits).
    full_name: profile?.full_name || (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') || '',
    date_of_birth: profile?.date_of_birth || '',
    gender: profile?.gender || '',
    language: profile?.language || 'English',
    height: profile?.height?.toString() || '',
    weight: profile?.weight?.toString() || '',
  });

  useEffect(() => {
    if (profile) {
      setForm(prev => ({
        full_name: prev.full_name || profile.full_name || '',
        date_of_birth: prev.date_of_birth || profile.date_of_birth || '',
        gender: prev.gender || profile.gender || '',
        language: prev.language || profile.language || 'English',
        height: prev.height || (profile.height ? profile.height.toString() : ''),
        weight: prev.weight || (profile.weight ? profile.weight.toString() : ''),
      }));
    }
  }, [profile]);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormData, string>>>({});

  // Route protection
  if (authLoading || onboardingLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/signin" replace />;

  const validate = (): boolean => {
    const errs: Partial<Record<keyof ProfileFormData, string>> = {};
    if (!form.full_name.trim()) errs.full_name = 'Name is required';
    if (form.height && (isNaN(Number(form.height)) || Number(form.height) < 30 || Number(form.height) > 300)) {
      errs.height = 'Enter a valid height in cm (30–300)';
    }
    if (form.weight && (isNaN(Number(form.weight)) || Number(form.weight) < 1 || Number(form.weight) > 500)) {
      errs.weight = 'Enter a valid weight in kg (1–500)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !user) return;

    setLoading(true);
    try {
      await upsertProfile(user.id, form);
      await refreshProfile();
      showToast('success', 'Profile saved successfully!');
      navigate('/plans');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save profile');
    }
    setLoading(false);
  };

  const updateField = (field: keyof ProfileFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <div className="card p-8 max-w-lg w-full">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <div className="text-center mb-6">
          <div
            className="mx-auto mb-3 flex items-center justify-center rounded-full"
            style={{ width: 64, height: 64, backgroundColor: 'var(--color-mint-soft)' }}
          >
            <User size={28} style={{ color: 'var(--color-emerald-primary)' }} />
          </div>
          <h1 className="text-xl font-bold">Tell us about yourself</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Profile details help us personalise your health records
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label" htmlFor="profile-name">Full Name</label>
            <input
              id="profile-name"
              type="text"
              className={`input-field ${errors.full_name ? 'input-error' : ''}`}
              placeholder="Enter your full name"
              value={form.full_name}
              onChange={e => updateField('full_name', e.target.value)}
              required
            />
            {errors.full_name && <span className="error-message">{errors.full_name}</span>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="profile-dob">Date of Birth <span className="optional">(optional)</span></label>
              <input
                id="profile-dob"
                type="date"
                className="input-field"
                value={form.date_of_birth}
                onChange={e => updateField('date_of_birth', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="profile-gender">Gender <span className="optional">(optional)</span></label>
              <select
                id="profile-gender"
                className="input-field"
                value={form.gender}
                onChange={e => updateField('gender', e.target.value)}
              >
                <option value="">Select</option>
                {genderOptions.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="profile-lang">Preferred Language <span className="optional">(optional)</span></label>
            <select
              id="profile-lang"
              className="input-field"
              value={form.language}
              onChange={e => updateField('language', e.target.value)}
            >
              {languageOptions.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="profile-height">Height (cm) <span className="optional">(optional)</span></label>
              <input
                id="profile-height"
                type="number"
                className={`input-field ${errors.height ? 'input-error' : ''}`}
                placeholder="e.g. 170"
                value={form.height}
                onChange={e => updateField('height', e.target.value)}
              />
              {errors.height && <span className="error-message">{errors.height}</span>}
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="profile-weight">Weight (kg) <span className="optional">(optional)</span></label>
              <input
                id="profile-weight"
                type="number"
                className={`input-field ${errors.weight ? 'input-error' : ''}`}
                placeholder="e.g. 65"
                value={form.weight}
                onChange={e => updateField('weight', e.target.value)}
              />
              {errors.weight && <span className="error-message">{errors.weight}</span>}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full mt-4" disabled={loading}>
            {loading ? (
              <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
            ) : (
              <>
                Continue to plan
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
