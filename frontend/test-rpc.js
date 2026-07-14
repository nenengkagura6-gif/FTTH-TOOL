import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
    // We need to login as admin to test the RPC
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'nenengkagura6@gmail.com',
        password: 'password123' // Wait, I don't know the password.
    });
}
run();
