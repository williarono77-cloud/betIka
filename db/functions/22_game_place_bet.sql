-- User: place bet; lock funds and create game_bets row
CREATE OR REPLACE FUNCTION public.game_place_bet(p_round_id TEXT, p_stake_cents INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_available INTEGER;
  v_locked INTEGER;
  v_bet_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_stake_cents IS NULL OR p_stake_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_STAKE';
  END IF;

  IF p_round_id IS NULL OR trim(p_round_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ROUND_ID';
  END IF;

  SELECT available_cents, locked_cents
  INTO v_available, v_locked
  FROM public.wallets
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_available < p_stake_cents THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  UPDATE public.wallets
  SET available_cents = available_cents - p_stake_cents,
      locked_cents = locked_cents + p_stake_cents
  WHERE user_id = v_uid;

  INSERT INTO public.game_bets (user_id, round_id, stake_cents, status)
  VALUES (v_uid, trim(p_round_id), p_stake_cents, 'placed')
  RETURNING id INTO v_bet_id;

  INSERT INTO public.ledger (
    user_id, type, amount_cents,
    before_available_cents, after_available_cents,
    before_locked_cents, after_locked_cents,
    reference_table, reference_id
  ) VALUES (
    v_uid, 'bet_lock', -p_stake_cents,
    v_available, v_available - p_stake_cents,
    v_locked, v_locked + p_stake_cents,
    'game_bets', v_bet_id
  );

  RETURN v_bet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.game_place_bet(TEXT, INTEGER) TO authenticated;
