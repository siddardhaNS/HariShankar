import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Banner, Button, Card, Chip, Header, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fonts, useColors } from '@/lib/theme';
import type { AgeGroup, Customer, Gender } from '@/lib/types';

const GENDERS: { key: Gender; label: string }[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
  { key: 'not_said', label: 'Prefer not to say' },
];
const AGES: { key: AgeGroup; label: string }[] = [
  { key: 'under_18', label: 'Under 18' },
  { key: '18_24', label: '18 to 24' },
  { key: '25_34', label: '25 to 34' },
  { key: '35_44', label: '35 to 44' },
  { key: '45_59', label: '45 to 59' },
  { key: '60_plus', label: '60 and above' },
  { key: 'not_said', label: 'Prefer not to say' },
];

export default function Profile() {
  const c = useColors();
  const { customer, setCustomer, signOut } = useAuth();
  const [name, setName] = useState(customer?.name ?? '');
  const [err, setErr] = useState<string | null>(null);

  if (!customer) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Header title="Profile" />
        <View style={{ padding: 20 }}>
          <Button title="Log in" onPress={() => router.replace('/login')} />
        </View>
      </View>
    );
  }

  const save = async (patch: Partial<Customer>) => {
    setErr(null);
    const before = customer;
    setCustomer({ ...customer, ...patch }); // optimistic
    try {
      setCustomer(await api<Customer>('/api/app/me', { method: 'PATCH', body: patch }));
    } catch (e) {
      setCustomer(before);
      setErr(e instanceof ApiError ? e.message : "Couldn't save. Try again");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Profile" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={[styles.avatar, { backgroundColor: c.ink }]}>
            <T style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 18 }}>{(customer.name || 'Me').slice(0, 1).toUpperCase()}</T>
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onEndEditing={() => name.trim() !== customer.name && save({ name: name.trim() })}
              placeholder="Your name"
              placeholderTextColor={c.muted}
              maxLength={80}
              accessibilityLabel="Name"
              style={{ fontFamily: fonts.bold, fontSize: 18, color: c.ink, padding: 0 }}
            />
            <T v="small">+91 {customer.mobile}</T>
          </View>
        </Card>

        {err && <Banner kind="error">{err}</Banner>}

        <Card>
          <T v="label">About you (optional)</T>
          <T v="small" style={{ marginTop: 4 }}>
            Helps the theatre plan shows. Only ever counted in totals, never shown with your name.
          </T>
          <T v="small" style={{ marginTop: 14, marginBottom: 8, color: c.ink2 }}>Gender</T>
          <View style={styles.wrap}>
            {GENDERS.map((g) => (
              <Chip key={g.key} label={g.label} selected={customer.gender === g.key} onPress={() => save({ gender: g.key })} />
            ))}
          </View>
          <T v="small" style={{ marginTop: 14, marginBottom: 8, color: c.ink2 }}>Age group</T>
          <View style={styles.wrap}>
            {AGES.map((a) => (
              <Chip key={a.key} label={a.label} selected={customer.age_group === a.key} onPress={() => save({ age_group: a.key })} />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 16 }}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <T v="label">Offers and new releases</T>
              <T v="small" style={{ marginTop: 2 }}>On WhatsApp and in the app. At most a few a week, never late at night.</T>
            </View>
            <Switch
              value={customer.offers_opt_in}
              onValueChange={(v) => save({ offers_opt_in: v })}
              trackColor={{ true: c.brand, false: c.field }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Offers and new releases"
            />
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <T v="label">Show reminders</T>
              <T v="small" style={{ marginTop: 2 }}>On the morning of the show and an hour before.</T>
            </View>
            <Switch
              value={customer.reminders_opt_in}
              onValueChange={(v) => save({ reminders_opt_in: v })}
              trackColor={{ true: c.brand, false: c.field }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Show reminders"
            />
          </View>
          <T v="small" style={{ fontSize: 12 }}>Your tickets always come with a booking, whatever you choose here.</T>
        </Card>

        <Button title="Gate scanner (theatre staff)" kind="secondary" onPress={() => router.push('/staff')} />

        <Button
          title="Log out"
          kind="ghost"
          onPress={async () => {
            await signOut();
            router.back();
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
