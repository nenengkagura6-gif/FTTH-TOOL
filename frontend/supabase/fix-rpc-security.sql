-- Jalankan ini di SQL Editor untuk memperbaiki pesan error Not Authorized saat di-test
CREATE OR REPLACE FUNCTION public.get_admin_payments()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    plan TEXT,
    billing_cycle TEXT,
    price_cents INTEGER,
    currency TEXT,
    sender_name TEXT,
    sender_bank TEXT,
    amount_paid INTEGER,
    receipt_url TEXT,
    status TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    email TEXT,
    full_name TEXT
) AS $$
BEGIN
    -- Allow SQL Editor (where auth.uid() is null) AND Admins to run this
    IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT 
        pc.id, pc.user_id, pc.plan, pc.billing_cycle, pc.price_cents, pc.currency,
        pc.sender_name, pc.sender_bank, pc.amount_paid, pc.receipt_url, pc.status, pc.admin_notes,
        pc.created_at, pc.updated_at,
        p.email, p.full_name
    FROM public.payment_confirmations pc
    LEFT JOIN public.profiles p ON p.id = pc.user_id
    ORDER BY pc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
