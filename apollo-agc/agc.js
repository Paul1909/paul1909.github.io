// Apollo Guidance Computer (Block II) emulator.
// A JavaScript port of the CPU core of yaAGC (agc_engine.c) from the Virtual AGC
// project by Ronald S. Burkey and contributors (GPL v2). Same licence applies here.
// One call to cycle() simulates one 11.72 µs memory cycle (MCT), exactly like
// agc_engine(); about 85,333 cycles make one second of AGC time.
'use strict';

(function (root) {
  const REG16 = 3;
  const RegA = 0, RegL = 1, RegQ = 2, RegEB = 3, RegFB = 4, RegZ = 5, RegBB = 6, RegZERO = 7;
  const RegZRUPT = 0o15, RegBRUPT = 0o17, RegCYR = 0o20, RegSR = 0o21, RegCYL = 0o22, RegEDOP = 0o23;
  const RegTIME2 = 0o24, RegTIME1 = 0o25, RegTIME3 = 0o26, RegTIME4 = 0o27, RegTIME5 = 0o30, RegTIME6 = 0o31;
  const RegOPTY = 0o35, RegOPTX = 0o36, RegGYROCTR = 0o47;
  const ChanSCALER2 = 0o3, ChanSCALER1 = 0o4;
  const CH77_PARITY_FAIL = 1, CH77_TC_TRAP = 4, CH77_RUPT_LOCK = 0o10, CH77_NIGHT_WATCHMAN = 0o20;
  const DSKY_AGC_WARN = 1, DSKY_TEMP = 0o10, DSKY_KEY_REL = 0o20, DSKY_VN_FLASH = 0o40, DSKY_OPER_ERR = 0o100,
    DSKY_RESTART = 0o200, DSKY_STBY = 0o400, DSKY_EL_OFF = 0o1000;
  const DSKY_OVERFLOW = 81920, DSKY_FLASH_PERIOD = 4;
  const WARNING_FILTER_INCREMENT = 15000, WARNING_FILTER_DECREMENT = 15, WARNING_FILTER_MAX = 140000, WARNING_FILTER_THRESHOLD = 20000;
  const SCALER_OVERFLOW = 80, SCALER_DIVIDER = 3;
  const AGC_P0 = 0, AGC_M0 = 0o77777, AGC_P1 = 1, AGC_M1 = 0o77776;
  const MASK9 = 0o777, MASK10 = 0o1777, MASK12 = 0o7777;
  const NUM_INTERRUPT_TYPES = 10;
  const FIX = 2048;                       // index of fixed bank 0 in the flat memory array
  const InstructionTiming = [0,0,0,0, 1,0,0,0, 2,1,1,1, 1,1,1,1, 1,1,1,1, 1,2,1,1, 1,1,1,1, 1,1,1,1];
  const ExtracodeTiming = [1,1,1,1, 5,0,0,0, 1,1,1,1, 2,2,2,2, 2,2,2,2, 1,1,1,1, 1,0,0,0, 2,2,2,2];

  // ---- ones'-complement helpers (straight from agc_engine.c) ----
  const dabs = x => { if (0o40000 & x) x = 0o37777 & ~x; return x > 1 ? x - 1 : AGC_P0; };
  const odabs = x => { if (0o100000 & x) x = 0o177777 & ~x; return x > 1 ? x - 1 : AGC_P0; };
  const agc2cpu = x => (0o40000 & x) ? -(0o37777 & ~x) : (0o37777 & x);
  const cpu2agc = x => x < 0 ? (0o77777 & ~(-x)) : (0o77777 & x);
  const agc2cpu2 = x => (0o2000000000 & x) ? -(0o1777777777 & ~x) : (0o1777777777 & x);
  const cpu2agc2 = x => x < 0 ? (0o3777777777 & ~(0o1777777777 & (-x))) : (0o1777777777 & x);
  const ValueOverflowed = v => { switch (v & 0o140000) { case 0o40000: return AGC_P1; case 0o100000: return AGC_M1; default: return AGC_P0; } };
  const OverflowCorrected = v => ((v & 0o37777) | ((v >> 1) & 0o40000));
  const SignExtend = w => ((w & 0o77777) | ((w << 1) & 0o100000));
  const AddSP16 = (a, b) => { let s = a + b; if (s & 0o200000) { s += AGC_P1; s &= 0o177777; } return s; };
  const AbsSP = v => (0o40000 & v) ? (0o77777 & ~v) : v;
  const NegateSP = v => (0o77777 & ~v);

  function SpToDecent(msb, lsb) {
    if (msb === AGC_P0 || msb === AGC_M0) {
      let v = SignExtend(lsb);
      if (v & 0o100000) v |= ~0o177777;
      return 0o7777777777 & v;
    }
    if ((0o40000 & lsb) !== (0o40000 & msb)) {
      if (lsb === AGC_P0 || lsb === AGC_M0) {
        lsb = (0 === (0o40000 & msb)) ? AGC_P0 : AGC_M0;
      } else {
        const comp = 0o40000 & msb;
        if (comp) { msb = 0o77777 & ~msb; lsb = 0o77777 & ~lsb; }
        msb--; lsb = (lsb + 0o40000 + AGC_P1) & 0o77777;
        if (comp) { msb = 0o77777 & ~msb; lsb = 0o77777 & ~lsb; }
      }
    }
    let v = (0o3777740000 & (msb << 14)) | (0o37777 & lsb);
    if (0o2000000000 & v) v |= 0o4000000000;
    return v;
  }
  function DecentToSp(d) {      // returns [msb, lsb]
    let lsb = 0o37777 & d;
    if (d & 0o4000000000) lsb |= 0o40000;
    return [OverflowCorrected(0o177777 & (d >> 14)), lsb];
  }
  function CounterPINC(m, i) { let v = m[i], o = 0; if (v === 0o37777) { o = 1; v = AGC_P0; } else { v = (v + 1) & 0o77777; if (v === AGC_P0) v++; } m[i] = v; return o; }
  function CounterDINC(m, i) {
    let v = m[i], r = 0;
    if (v === AGC_P0 || v === AGC_M0) r = 1;
    else if (0o40000 & v) v = AddSP16(SignExtend(v), SignExtend(AGC_P1)) & 0o77777;
    else v = AddSP16(SignExtend(v), SignExtend(AGC_M1)) & 0o77777;
    m[i] = v; return r;
  }

  class AGC {
    constructor(rope) {
      this.rope = rope;                  // Uint16Array, fixed banks 0..n in bank order, 1024 words each
      this.m = new Uint16Array(FIX + 40 * 1024);
      this.ch = new Uint16Array(512);
      this.out10 = new Uint16Array(16);
      this.ir = new Uint8Array(NUM_INTERRUPT_TYPES + 1);
      this.hits = new Uint32Array(40 * 1024);   // executions per rope address (for the live code view)
      this.hooks = new Uint8Array(40 * 1024);   // rope addresses that call onHook()
      this.onHook = null;
      this.onRupt = null;
      this.reset();
    }

    reset() {
      const m = this.m; m.fill(0);
      for (let i = 0; i < this.rope.length && i < 40 * 1024; i++) m[FIX + i] = this.rope[i];
      this.ch.fill(0);
      this.ch[0o30] = 0o37777; this.ch[0o31] = 0o77777; this.ch[0o32] = 0o77777; this.ch[0o33] = 0o77777;
      m[RegZ] = 0o4000;
      this.cycles = 0; this.extraCode = 0; this.allowInterrupt = 1;
      this.pendFlag = 0; this.pendDelay = 0; this.extraDelay = 0;
      this.outputChannel7 = 0; this.out10.fill(0); this.indexValue = 0; this.ir.fill(0);
      this.inIsr = 0; this.substitute = 0; this.downruptTimeValid = 1; this.downruptTime = 0; this.downlink = 0;
      this.nightWatchman = 0; this.nightWatchmanTripped = 0; this.ruptLock = 0; this.noRupt = 0;
      this.tcTrap = 0; this.noTC = 0; this.parityFail = 0; this.warningFilter = 0; this.generatedWarning = 0;
      this.restartLight = 0; this.standby = 0; this.sbyPressed = 0; this.sbyStillPressed = 0;
      this.nextZ = 0; this.scaler = 0; this.dskyTimer = 0; this.dskyFlash = 0; this.dsky163 = 0;
      this.tookBZF = 0; this.tookBZMF = 0; this.trap31A = 0; this.trap31B = 0; this.trap32 = 0;
      this.radarGate = 0; this.gyroCount = 0; this.gyroTimer = 0; this.oldCh14 = 0;
      this.pcIdx = FIX + 2 * 1024; this.restarts = 0; this.lastAlarm = '';
      this.steal = this.steal || 0; this.stealAcc = 0; this.stolen = 0;
      this.hits.fill(0);
    }

    // ---- memory ----
    find(a12) {
      a12 &= 0o7777;
      if (a12 === 0o67) this.nightWatchman = 0;
      if (a12 < 0o400) return a12;
      if (a12 < 0o1000) return 0o400 + (a12 & 0o377);
      if (a12 < 0o1400) return 0o1000 + (a12 & 0o377);
      if (a12 < 0o2000) return ((7 & (this.m[RegEB] >> 8)) << 8) + (a12 & 0o377);
      let fb;
      if (a12 < 0o4000) {
        fb = 0o37 & (this.m[RegFB] >> 10);
        if ((fb & 0o30) === 0o30 && (this.outputChannel7 & 0o100)) fb += 0o10;
      } else fb = a12 < 0o6000 ? 2 : 3;
      return FIX + fb * 1024 + (a12 & 0o1777);
    }
    assign(idx, v) {
      if (idx < 0 || idx >= FIX) return;   // fixed memory is read-only
      const m = this.m;
      if (idx < 0o400) {
        switch (idx) {
          case RegZ: this.nextZ = v; break;
          case RegCYR: v &= 0o77777; v = (v & 1) ? ((v >> 1) | 0o40000) : (v >> 1); break;
          case RegSR: v &= 0o77777; v = (v & 0o40000) ? ((v >> 1) | 0o40000) : (v >> 1); break;
          case RegCYL: v &= 0o77777; v = (v & 0o40000) ? ((v << 1) + 1) : (v << 1); break;
          case RegEDOP: v &= 0o77777; v = (v >> 7) & 0o177; break;
          case RegZERO: v = AGC_P0; break;
        }
        m[idx] = (idx >= REG16 || (idx >= 0o20 && idx <= 0o23)) ? (v & 0o77777) : (v & 0o177777);
      } else m[idx] = v & 0o77777;
    }

    // ---- i/o channels ----
    writeIO(a, v) {
      v &= 0o77777;
      if (a < 0 || a > 0o777) return;
      if (a === RegL || a === RegQ) this.m[a] = v;
      if (a === 0o10) this.out10[(v >> 11) & 0o17] = v;
      else if ((a === 0o15 || a === 0o16) && v === 0o22) this.restartLight = 0;
      else if (a === 0o33) v = (this.ch[a] & 0o76000) | (v & 0o01777);
      this.ch[a] = v;
    }
    readIO(a) {
      if (a < 0 || a > 0o777) return 0;
      if (a === RegL || a === RegQ) return this.m[a];
      return this.ch[a];
    }
    cpuWriteIO(a, v) {
      if (a === 0o13) {
        if (v & 0o04000) this.trap31A = 1;
        if (v & 0o10000) this.trap31B = 1;
        if (v & 0o20000) this.trap32 = 1;
        v &= 0o43777;
      }
      if (a === 0o33) {
        this.ch[a] |= 0o76000;
        if (this.warningFilter > WARNING_FILTER_THRESHOLD) this.ch[a] &= 0o57777;
        v = this.ch[a];
      } else if (a === 0o77) {
        v = 0; if (this.nightWatchmanTripped) v |= CH77_NIGHT_WATCHMAN;
      } else if (a === 0o11 && (v & 0o1000)) this.restartLight = 0;
      this.writeIO(a, v);
      if (a === 7) { this.outputChannel7 = v & 0o160; this.ch[7] = this.outputChannel7; }
      if (a === 0o34) this.downlink |= 1; else if (a === 0o35) this.downlink |= 2;
      if (this.downlink === 3) { this.downruptTimeValid = 1; this.downruptTime = this.cycles + 1707; this.downlink = 0; }
    }

    // ---- DSKY inputs ----
    key(code) { this.writeIO(0o15, code); this.ir[5] = 1; }
    pro(down) { if (down) this.ch[0o32] &= ~0o20000; else this.ch[0o32] |= 0o20000; }

    updateDSKY() {
      let d = this.dsky163 & ~(DSKY_KEY_REL | DSKY_VN_FLASH | DSKY_OPER_ERR | DSKY_RESTART | DSKY_STBY | DSKY_AGC_WARN | DSKY_TEMP);
      const ch = this.ch;
      if (ch[0o13] & 0o1000) d |= DSKY_RESTART | DSKY_STBY;
      if (this.standby) d |= DSKY_STBY;
      if (this.restartLight) d |= DSKY_RESTART;
      if ((ch[0o11] & 0o10) || (ch[0o30] & 0o40000)) d |= DSKY_TEMP;
      if (ch[0o11] & DSKY_KEY_REL) d |= DSKY_KEY_REL;
      if (ch[0o11] & DSKY_OPER_ERR) d |= DSKY_OPER_ERR;
      if (this.warningFilter > WARNING_FILTER_THRESHOLD) { d |= DSKY_AGC_WARN; ch[0o33] &= 0o57777; }
      while (this.dskyTimer >= DSKY_OVERFLOW) { this.dskyTimer -= DSKY_OVERFLOW; this.dskyFlash = (this.dskyFlash + 1) % DSKY_FLASH_PERIOD; }
      if (!this.standby && this.dskyFlash === 0) {
        if (ch[0o11] & DSKY_VN_FLASH) d |= DSKY_VN_FLASH;
        d &= ~(DSKY_KEY_REL | DSKY_OPER_ERR);
      }
      this.dsky163 = d;
    }

    alarmCounter(a10, sum) {
      if (ValueOverflowed(sum) === AGC_P0) return;
      if (a10 === RegTIME1) CounterPINC(this.m, RegTIME2);
      else if (a10 === RegTIME5) this.ir[2] = 1;
      else if (a10 === RegTIME3) this.ir[3] = 1;
      else if (a10 === RegTIME4) this.ir[4] = 1;
    }

    simulateDV(divisor) {
      const m = this.m;
      let a = m[RegA], l = m[RegL], dividendSign = a & 0o100000;
      if (!dividendSign) a = (~a) & 0xffff;
      if (a === 0o177777) dividendSign = l & 0o100000;
      if (dividendSign) l = (~l) & 0xffff;
      l = AddSP16(l, 0o40000) & 0xffff;
      if (ValueOverflowed(l) !== AGC_P1) a = AddSP16(a, 1) & 0xffff;
      let rem = a;
      const divisorSign = divisor & 0o100000;
      if (divisorSign) divisor = (~divisor) & 0xffff;
      const qs = l & 0o100000;
      let q = (qs | ((l & 0o37777) << 1) | (qs >> 15)) & 0xffff;
      for (let i = 0; i < 14; i++) {
        q = (q << 1) & 0xffff;
        const rs = rem & 0o100000;
        rem = (rs | ((rem & 0o37777) << 1)) & 0xffff;
        if ((q & 0o100000) === 0) rem |= (rs >> 15);
        const sum = AddSP16(rem, divisor) & 0xffff;
        if (sum & 0o100000) { q |= 1; rem = sum; }
      }
      a = qs | (q & 0o77777);
      m[RegA] = (dividendSign !== divisorSign) ? ~a : a;
      m[RegL] = dividendSign ? rem : ~rem;
    }

    gojam() {
      const m = this.m;
      this.extraDelay += 2;
      m[RegQ] = m[RegZ]; m[RegZ] = 0o4000;
      this.inIsr = 0; this.allowInterrupt = 1; this.parityFail = 0;
      this.trap31A = this.trap31B = this.trap32 = 0;
      for (let i = 1; i <= NUM_INTERRUPT_TYPES; i++) this.ir[i] = 0;
      for (const c of [0o05, 0o06, 0o10, 0o11, 0o12, 0o13, 0o14]) this.cpuWriteIO(c, 0);
      this.ch[0o33] |= 0o02000;
      this.cpuWriteIO(0o34, 0); this.cpuWriteIO(0o35, 0); this.downruptTimeValid = 0;
      this.indexValue = AGC_P0; this.extraCode = 0; this.substitute = 0; this.pendFlag = 0; this.pendDelay = 0;
      this.tookBZF = 0; this.tookBZMF = 0;
      if (!this.standby) { this.restartLight = 1; this.generatedWarning = 1; }
      this.restarts++;
    }

    // ---- one memory cycle ----
    cycle() {
      const m = this.m, ch = this.ch;
      let keepExtraCode = 0, executedTC = 0, tcTransient = 0, justBZF = 0, justBZMF = 0;
      if (this.downruptTimeValid && this.cycles >= this.downruptTime) { this.ir[8] = 1; this.downruptTimeValid = 0; }
      if (this.cycles === 0) this.restartLight = 1;
      this.cycles++;
      this.scaler += SCALER_DIVIDER;
      this.dskyTimer += SCALER_DIVIDER;
      this.updateDSKY();
      // Optional cycle stealing: unprogrammed counter increments (like the rendezvous-radar
      // CDU pulses on Apollo 11) each take one memory cycle away from the program.
      if (this.steal > 0) {
        this.stealAcc += this.steal;
        if (this.stealAcc >= 1) { this.stealAcc -= 1; this.stolen++; m[RegOPTY] = (m[RegOPTY] + 1) & 0o77777; return; }
      }

      if (this.extraDelay) { this.extraDelay--; return; }
      if (this.pendFlag && this.pendDelay > 0) { this.pendDelay--; return; }
      if (ch[0o32] & 0o20000) { this.sbyPressed = 0; this.sbyStillPressed = 0; }

      while (this.scaler >= SCALER_OVERFLOW) {
        let alarm = '';
        this.scaler -= SCALER_OVERFLOW;
        ch[ChanSCALER1]++;
        if (ch[ChanSCALER1] === 0o40000) { ch[ChanSCALER1] = 0; ch[ChanSCALER2] = (ch[ChanSCALER2] + 1) & 0o37777; }
        const s1 = ch[ChanSCALER1];
        if ((0o7777 & s1) === 0o4000) {
          if (!this.standby) this.nightWatchman = 1;
          if (this.sbyPressed && ((ch[0o13] & 0o02000) || this.standby)) {
            if (!this.standby) { this.standby = 1; this.sbyStillPressed = 1; alarm = 'Standby'; this.dsky163 |= DSKY_STBY | DSKY_EL_OFF; }
            else if (!this.sbyStillPressed) { this.standby = 0; this.dsky163 &= ~(DSKY_STBY | DSKY_EL_OFF); }
          }
        } else if ((0o7777 & s1) === 0) {
          if ((ch[0o32] & 0o20000) === 0) this.sbyPressed = 1;
          if (!this.standby && this.nightWatchman) { alarm = 'Night Watchman'; ch[0o77] |= CH77_NIGHT_WATCHMAN; this.nightWatchmanTripped = 1; }
          else this.nightWatchmanTripped = 0;
        } else if ((0o7 & s1) === 0) {
          if ((0o777 & s1) === 0o400 && (this.generatedWarning || (ch[0o13] & 0o1000))) {
            this.generatedWarning = 0;
            this.warningFilter = Math.min(WARNING_FILTER_MAX, this.warningFilter + WARNING_FILTER_INCREMENT);
          } else this.warningFilter = Math.max(0, this.warningFilter - WARNING_FILTER_DECREMENT);
        }
        if (!this.standby) {
          if ((0o777 & s1) === 0o400) { this.ruptLock = 1; this.noRupt = 1; }
          else if ((this.ruptLock || this.noRupt) && (0o777 & s1) === 0o300) { alarm = this.ruptLock ? 'Rupt Lock' : 'No Rupt'; ch[0o77] |= CH77_RUPT_LOCK; }
          if ((0o37 & s1) === 0o20) { this.tcTrap = 1; this.noTC = 1; }
          else if ((this.tcTrap || this.noTC) && (0o37 & s1) === 0) { alarm = 'TC Trap'; ch[0o77] |= CH77_TC_TRAP; }
          if ((0o37 & s1) === 0o20) {
            this.extraDelay++;
            if (CounterPINC(m, RegTIME1)) { this.extraDelay++; CounterPINC(m, RegTIME2); }
            this.extraDelay++;
            if (CounterPINC(m, RegTIME3)) this.ir[3] = 1;
          }
          if ((0o37 & s1) === 0) {
            this.extraDelay++;
            if (CounterPINC(m, RegTIME5)) this.ir[2] = 1;
            if (ch[0o13] & 0o10) this.radarGate++;
          }
          if ((0o37 & s1) === 0o10) {
            this.extraDelay++;
            if (CounterPINC(m, RegTIME4)) this.ir[4] = 1;
          }
          if ((0o40000 & ch[0o13]) && (s1 & 1) === 1) {
            this.extraDelay++;
            if (CounterDINC(m, RegTIME6)) { this.ir[1] = 1; this.cpuWriteIO(0o13, ch[0o13] & 0o37777); }
          }
          if (this.trap31A && (ch[0o31] & 0o77) !== 0o77) { this.trap31A = 0; this.ir[10] = 1; }
          if (this.trap31B && (ch[0o31] & 0o7700) !== 0o7700) { this.trap31B = 0; this.ir[10] = 1; }
          if (this.trap32 && (ch[0o32] & 0o1777) !== 0o1777) { this.trap32 = 0; this.ir[10] = 1; }
          if (this.radarGate === 9 && (0o37 & s1) === 0o36) { this.radarGate = 0; ch[0o13] &= ~0o10; this.ir[9] = 1; }
        }
        if (alarm || this.parityFail) {
          if (!this.inhibitAlarms) { if (alarm !== 'Standby') this.lastAlarm = alarm || 'Parity'; this.gojam(); }
        }
        if (this.extraDelay) { this.extraDelay--; return; }
      }
      if (this.standby) return;

      // Gyro torquing pulses are simply absorbed (no IMU is simulated).
      if ((ch[0o14] & 0o1000) && m[RegGYROCTR]) { m[RegGYROCTR] = 0; }
      if (m[RegOPTX] && (ch[0o14] & 0o2000)) m[RegOPTX] = 0;
      if (m[RegOPTY] && (ch[0o14] & 0o4000)) m[RegOPTY] = 0;

      // ---- instruction decode ----
      const currentEB = m[RegEB], currentFB = m[RegFB], currentBB = m[RegBB];
      let acc = m[RegA] & 0o177777;
      const overflow = ValueOverflowed(acc) !== AGC_P0;
      const pc = m[RegZ] & 0o7777;
      let ww = this.find(pc);
      let instr;
      if (this.substitute) instr = m[RegBRUPT];
      else instr = OverflowCorrected(AddSP16(SignExtend(this.indexValue), SignExtend(m[ww])));
      instr &= 0o77777;
      const sExtra = this.extraCode;
      let xop = instr >> 9;
      if (sExtra) xop |= 0o100;
      const quarter = instr & ~MASK10 & 0o77777;
      const a12 = instr & MASK12, a10 = instr & MASK10, a9 = instr & MASK9;

      if ((!this.inIsr && this.allowInterrupt && !this.extraCode && !this.pendFlag && !overflow
           && instr !== 3 && instr !== 4 && instr !== 6) || xop === 0o107) {
        let req = 0, i;
        for (i = 1; i <= NUM_INTERRUPT_TYPES; i++) {
          if (this.ir[i]) { this.ir[i] = 0; this.ir[0] = i; this.nextZ = 0o4000 + 4 * i; req = 1; break; }
        }
        if (!req && xop === 0o107) { this.nextZ = 0; req = 1; }
        if (req) {
          m[RegZRUPT] = pc + 1; m[RegBRUPT] = instr;
          this.extraCode = 0; this.indexValue = AGC_P0; this.substitute = 0;
          this.inIsr = 1; this.extraDelay++;
          if (this.onRupt) this.onRupt(i);
          this.allDone(currentEB, currentFB, currentBB, 0, 0, 0, 0, 0);
          return;
        }
      }

      if (!this.pendFlag) {
        let t = quarter >> 10;
        t = this.extraCode ? ExtracodeTiming[t] : InstructionTiming[t];
        if (t) { this.pendFlag = 1; this.pendDelay = t - 1; return; }
      } else this.pendFlag = 0;

      this.indexValue = AGC_P0;
      this.substitute = 0;
      this.nextZ = 1 + m[RegZ];
      m[RegZ] = this.nextZ;
      if (this.tookBZF && !(xop === 0 && a12 === 6)) tcTransient = 1;

      // record what is executing, for the live views
      if (ww >= FIX) { const r = ww - FIX; this.hits[r]++; this.pcIdx = ww; if (this.hooks[r] && this.onHook) this.onHook(r); }
      else this.pcIdx = ww;

      let op16, k;
      switch (xop) {
        case 0o00: case 0o01: case 0o02: case 0o03: case 0o04: case 0o05: case 0o06: case 0o07:
          k = a12;
          if (k === 3) { this.allowInterrupt = 1; if (this.tookBZF || this.tookBZMF) tcTransient = 1; }
          else if (k === 4) { this.allowInterrupt = 0; if (this.tookBZF || this.tookBZMF) tcTransient = 1; }
          else if (k === 6) { this.extraCode = 1; keepExtraCode = 1; }
          else {
            if (k !== RegQ) m[RegQ] = 0o177777 & this.nextZ;
            this.nextZ = a12; executedTC = 1;
          }
          break;
        case 0o10: case 0o11: {          // CCS
          let vk = 0;
          if (a10 < REG16) { vk = 0o177777 & m[a10]; op16 = OverflowCorrected(vk); m[RegA] = odabs(vk); }
          else { ww = this.find(a10); op16 = m[ww] & 0o77777; m[RegA] = dabs(op16); this.assign(ww, op16); }
          if (a10 < REG16 && ValueOverflowed(vk) === AGC_P1) this.nextZ += 0;
          else if (a10 < REG16 && ValueOverflowed(vk) === AGC_M1) this.nextZ += 2;
          else if (op16 === AGC_P0) this.nextZ += 1;
          else if (op16 === AGC_M0) this.nextZ += 3;
          else if (op16 & 0o40000) this.nextZ += 2;
          break;
        }
        case 0o12: case 0o13: case 0o14: case 0o15: case 0o16: case 0o17:   // TCF
          this.nextZ = a12; executedTC = 1; break;
        case 0o20: case 0o21: {          // DAS
          let msw, lsw;
          if (a10 === RegL) {
            lsw = AddSP16(0o177777 & m[RegL], 0o177777 & m[RegL]);
            msw = AddSP16(acc, acc);
            if ((0o140000 & lsw) === 0o40000) msw = AddSP16(msw, AGC_P1);
            else if ((0o140000 & lsw) === 0o100000) msw = AddSP16(msw, SignExtend(AGC_M1));
            lsw = OverflowCorrected(lsw);
            m[RegA] = msw; m[RegL] = SignExtend(lsw);
            break;
          }
          ww = this.find(a10);
          lsw = a10 < REG16 ? AddSP16(0o177777 & m[RegL], 0o177777 & m[a10]) : AddSP16(0o177777 & m[RegL], SignExtend(m[ww]));
          msw = a10 < REG16 + 1 ? AddSP16(acc, 0o177777 & m[a10 - 1]) : AddSP16(acc, SignExtend(m[ww - 1]));
          if ((0o140000 & lsw) === 0o40000) msw = AddSP16(msw, AGC_P1);
          else if ((0o140000 & lsw) === 0o100000) msw = AddSP16(msw, SignExtend(AGC_M1));
          lsw = OverflowCorrected(lsw);
          if ((0o140000 & msw) === 0o100000) m[RegA] = SignExtend(AGC_M1);
          else if ((0o140000 & msw) === 0o40000) m[RegA] = AGC_P1;
          else m[RegA] = AGC_P0;
          m[RegL] = AGC_P0;
          if (a10 < REG16) m[a10] = SignExtend(lsw); else this.assign(ww, lsw);
          if (a10 < REG16 + 1) m[a10 - 1] = msw; else this.assign(ww - 1, OverflowCorrected(msw));
          break;
        }
        case 0o22: case 0o23:            // LXCH
          if (a10 === RegL) break;
          if (a10 === RegZERO) m[RegL] = AGC_P0;
          else if (a10 < REG16) {
            op16 = m[RegL]; m[RegL] = m[a10]; m[a10] = op16;
            if (a10 === RegZ) this.nextZ = m[RegZ];
          } else {
            ww = this.find(a10); op16 = m[ww];
            this.assign(ww, OverflowCorrected(0o177777 & m[RegL]));
            m[RegL] = SignExtend(op16);
          }
          break;
        case 0o24: case 0o25: {          // INCR
          ww = this.find(a10);
          if (a10 < REG16) m[a10] = AddSP16(AGC_P1, 0o177777 & m[a10]);
          else { const s = AddSP16(AGC_P1, SignExtend(m[ww])); this.assign(ww, OverflowCorrected(s)); this.alarmCounter(a10, s); }
          break;
        }
        case 0o26: case 0o27:            // ADS
          ww = this.find(a10);
          if (a10 === RegA) acc = AddSP16(acc, acc);
          else if (a10 < REG16) acc = AddSP16(acc, 0o177777 & m[a10]);
          else acc = AddSP16(acc, SignExtend(m[ww]));
          m[RegA] = acc;
          if (a10 === RegA) { /* nothing */ }
          else if (a10 < REG16) m[a10] = acc;
          else this.assign(ww, OverflowCorrected(acc));
          break;
        case 0o30: case 0o31: case 0o32: case 0o33: case 0o34: case 0o35: case 0o36: case 0o37:   // CA
          if (a12 === RegA) break;
          if (a12 < REG16) { m[RegA] = m[a12]; break; }
          ww = this.find(a12); m[RegA] = SignExtend(m[ww]); this.assign(ww, m[ww]);
          break;
        case 0o40: case 0o41: case 0o42: case 0o43: case 0o44: case 0o45: case 0o46: case 0o47:   // CS
          tcTransient = 1;
          if (a12 === RegA) { m[RegA] = ~acc; break; }
          if (a12 < REG16) { m[RegA] = ~m[a12]; break; }
          ww = this.find(a12); m[RegA] = SignExtend(NegateSP(m[ww])); this.assign(ww, m[ww]);
          break;
        case 0o50: case 0o51:            // INDEX / RESUME
          if (a10 === 0o17) { this.resume(); break; }
          if (a10 < REG16) this.indexValue = OverflowCorrected(m[a10]);
          else { ww = this.find(a10); this.indexValue = m[ww]; }
          break;
        case 0o150: case 0o151: case 0o152: case 0o153: case 0o154: case 0o155: case 0o156: case 0o157:
          if (a12 === (0o17 << 1)) { this.resume(); }
          else {
            if (a12 < REG16) this.indexValue = OverflowCorrected(m[a12]);
            else { ww = this.find(a12); this.indexValue = m[ww]; }
            keepExtraCode = 1;
          }
          break;
        case 0o52: case 0o53:            // DXCH
          tcTransient = 1;
          if (a10 === RegL) { m[RegL] = SignExtend(OverflowCorrected(m[RegL])); break; }
          ww = this.find(a10);
          if (a10 < REG16) {
            op16 = m[a10]; m[a10] = m[RegL]; m[RegL] = op16;
            if (a10 === RegZ) this.nextZ = m[RegZ];
          } else {
            op16 = SignExtend(m[ww]); this.assign(ww, OverflowCorrected(m[RegL])); m[RegL] = op16;
          }
          m[RegL] = SignExtend(OverflowCorrected(m[RegL]));
          if (a10 < REG16 + 1) {
            op16 = m[a10 - 1]; m[a10 - 1] = m[RegA]; m[RegA] = op16;
            if (a10 === RegZ + 1) this.nextZ = m[RegZ];
          } else {
            op16 = SignExtend(m[ww - 1]); this.assign(ww - 1, OverflowCorrected(m[RegA])); m[RegA] = op16;
          }
          break;
        case 0o54: case 0o55:            // TS
          tcTransient = 1;
          if (a10 === RegA) { if (overflow) this.nextZ += AGC_P1; }
          else if (a10 === RegZ) {
            this.nextZ = 0o77777 & acc;
            if (overflow) m[RegA] = SignExtend(ValueOverflowed(acc));
          } else {
            ww = this.find(a10);
            if (a10 < REG16) m[a10] = acc; else this.assign(ww, OverflowCorrected(acc));
            if (overflow) { m[RegA] = SignExtend(ValueOverflowed(acc)); this.nextZ += AGC_P1; }
          }
          break;
        case 0o56: case 0o57:            // XCH
          tcTransient = 1;
          if (a10 === RegA) break;
          if (a10 < REG16) {
            m[RegA] = m[a10]; m[a10] = acc;
            if (a10 === RegZ) this.nextZ = m[RegZ];
            break;
          }
          ww = this.find(a10); m[RegA] = SignExtend(m[ww]); this.assign(ww, OverflowCorrected(acc));
          break;
        case 0o60: case 0o61: case 0o62: case 0o63: case 0o64: case 0o65: case 0o66: case 0o67:   // AD
          if (a12 === RegA) acc = AddSP16(acc, acc);
          else if (a12 < REG16) acc = AddSP16(acc, 0o177777 & m[a12]);
          else { ww = this.find(a12); acc = AddSP16(acc, SignExtend(m[ww])); this.assign(ww, m[ww]); }
          m[RegA] = acc;
          break;
        case 0o70: case 0o71: case 0o72: case 0o73: case 0o74: case 0o75: case 0o76: case 0o77:   // MASK
          if (a12 < REG16) m[RegA] = acc & m[a12];
          else { const v = OverflowCorrected(acc); ww = this.find(a12); m[RegA] = SignExtend(v & m[ww]); }
          break;
        case 0o100:                     // READ
          if (a9 === RegL || a9 === RegQ) m[RegA] = m[a9]; else m[RegA] = SignExtend(this.readIO(a9));
          break;
        case 0o101:                     // WRITE
          if (a9 === RegL || a9 === RegQ) m[a9] = acc; else this.cpuWriteIO(a9, OverflowCorrected(acc));
          break;
        case 0o102:                     // RAND
          if (a9 === RegL || a9 === RegQ) m[RegA] = acc & m[a9];
          else m[RegA] = SignExtend(OverflowCorrected(acc) & this.readIO(a9));
          break;
        case 0o103:                     // WAND
          if (a9 === RegL || a9 === RegQ) { m[a9] = acc & m[a9]; m[RegA] = m[a9]; }
          else { op16 = OverflowCorrected(acc) & this.readIO(a9); this.cpuWriteIO(a9, op16); m[RegA] = SignExtend(op16); }
          break;
        case 0o104:                     // ROR
          if (a9 === RegL || a9 === RegQ) m[RegA] = acc | m[a9];
          else m[RegA] = SignExtend(OverflowCorrected(acc) | this.readIO(a9));
          break;
        case 0o105:                     // WOR
          if (a9 === RegL || a9 === RegQ) { m[a9] = acc | m[a9]; m[RegA] = m[a9]; }
          else { op16 = OverflowCorrected(acc) | this.readIO(a9); this.cpuWriteIO(a9, op16); m[RegA] = SignExtend(op16); }
          break;
        case 0o106:                     // RXOR
          if (a9 === RegL || a9 === RegQ) m[RegA] = acc ^ m[a9];
          else m[RegA] = SignExtend(OverflowCorrected(acc) ^ this.readIO(a9));
          break;
        case 0o107: break;              // EDRUPT (handled as an interrupt above)
        case 0o110: case 0o111: {        // DV
          const acc0 = OverflowCorrected(acc), accL = m[RegL];
          let dividend = SpToDecent(acc0, accL);
          const pair = DecentToSp(dividend);
          const absA = AbsSP(pair[0]), absL = AbsSP(pair[1]);
          let div16;
          if (a10 === RegA) { div16 = m[RegA]; if ((m[RegA] & 0o100000) === 0) div16 = 0o177777 & ~div16; }
          else if (a10 === RegL) {
            div16 = m[RegL];
            if (((absA === 0) && (0o100000 & m[RegL])) || ((absA !== 0) && (0o100000 & m[RegA]))) div16 = 0o177777 & ~div16;
            div16 = SignExtend(OverflowCorrected(AddSP16(div16 & 0xffff, 0o40000)));
          } else if (a10 === RegZ) {
            div16 = m[RegZ];
            if (((absA === 0) && (0o100000 & m[RegL])) || ((absA !== 0) && (0o100000 & m[RegA]))) div16 |= 0o100000;
          } else if (a10 < REG16) div16 = m[a10];
          else div16 = SignExtend(m[this.find(a10)]);
          div16 &= 0xffff;
          const absK = AbsSP(OverflowCorrected(div16));
          if (absA > absK || (absA === absK && absL !== AGC_P0) || ValueOverflowed(div16) !== AGC_P0) {
            this.simulateDV(div16);
          } else if (absA === 0 && absL === 0) {
            if ((0o40000 & m[RegL]) === (0o40000 & OverflowCorrected(div16))) op16 = absK === 0 ? 0o37777 : AGC_P0;
            else op16 = absK === 0 ? (0o77777 & ~0o37777) : AGC_M0;
            m[RegA] = SignExtend(op16);
          } else if (absA === absK && absL === AGC_P0) {
            op16 = (pair[0] === OverflowCorrected(div16)) ? 0o37777 : (0o77777 & ~0o37777);
            m[RegL] = SignExtend(pair[0]); m[RegA] = SignExtend(op16);
          } else {
            dividend = agc2cpu2(dividend);
            const divisor = agc2cpu(OverflowCorrected(div16));
            const quot = Math.trunc(dividend / divisor), rem = dividend % divisor;
            m[RegA] = SignExtend(cpu2agc(quot));
            if (rem === 0) m[RegL] = dividend >= 0 ? AGC_P0 : SignExtend(AGC_M0);
            else m[RegL] = SignExtend(cpu2agc(rem));
          }
          break;
        }
        case 0o112: case 0o113: case 0o114: case 0o115: case 0o116: case 0o117:   // BZF
          if (acc === 0 || acc === 0o177777) { this.nextZ = a12; justBZF = 1; }
          break;
        case 0o120: case 0o121: {        // MSU
          ww = this.find(a10);
          let ui, uj;
          if (a10 < REG16) { ui = 0o177777 & acc; uj = 0o177777 & ~m[a10]; }
          else { ui = 0o77777 & OverflowCorrected(acc); uj = 0o77777 & ~m[ww]; }
          let diff = ui + uj + 1;
          if (diff & 0o40000) { diff |= 0o100000; diff--; }
          if (a10 === RegQ) m[RegA] = 0o177777 & diff;
          else m[RegA] = SignExtend(0o77777 & diff);
          if (a10 >= 0o20 && a10 <= 0o23) this.assign(ww, m[ww]);
          break;
        }
        case 0o122: case 0o123:          // QXCH
          if (a10 === RegQ) break;
          if (a10 === RegZERO) m[RegQ] = AGC_P0;
          else if (a10 < REG16) {
            op16 = m[RegQ]; m[RegQ] = m[a10]; m[a10] = op16;
            if (a10 === RegZ) this.nextZ = m[RegZ];
          } else {
            ww = this.find(a10); op16 = OverflowCorrected(m[RegQ]);
            m[RegQ] = SignExtend(m[ww]); this.assign(ww, op16);
          }
          break;
        case 0o124: case 0o125: {        // AUG
          ww = this.find(a10);
          let o = a10 < REG16 ? m[a10] : SignExtend(m[ww]);
          o &= 0o177777;
          const inc = (0 === (0o100000 & o)) ? AGC_P1 : SignExtend(AGC_M1);
          const s = AddSP16(0o177777 & inc, o);
          if (a10 < REG16) m[a10] = s;
          else { this.assign(ww, OverflowCorrected(s)); this.alarmCounter(a10, s); }
          break;
        }
        case 0o126: case 0o127: {        // DIM
          ww = this.find(a10);
          let o = a10 < REG16 ? m[a10] : SignExtend(m[ww]);
          o &= 0o177777;
          if (o === AGC_P0 || o === SignExtend(AGC_M0)) break;
          const inc = (0 === (0o100000 & o)) ? SignExtend(AGC_M1) : AGC_P1;
          const s = AddSP16(0o177777 & inc, o);
          if (a10 < REG16) m[a10] = s; else this.assign(ww, OverflowCorrected(s));
          break;
        }
        case 0o130: case 0o131: case 0o132: case 0o133: case 0o134: case 0o135: case 0o136: case 0o137:   // DCA
          if (a12 === RegL) { m[RegL] = SignExtend(OverflowCorrected(m[RegL])); break; }
          ww = this.find(a12);
          m[RegL] = a12 < REG16 ? m[a12] : SignExtend(m[ww]);
          m[RegL] = SignExtend(OverflowCorrected(m[RegL]));
          m[RegA] = a12 < REG16 + 1 ? m[a12 - 1] : SignExtend(m[ww - 1]);
          if (a12 >= 0o20 && a12 <= 0o23) this.assign(ww, m[ww]);
          if (a12 >= 0o21 && a12 <= 0o24) this.assign(ww - 1, m[ww - 1]);
          break;
        case 0o140: case 0o141: case 0o142: case 0o143: case 0o144: case 0o145: case 0o146: case 0o147:   // DCS
          if (a12 === RegL) {
            m[RegA] = ~acc; m[RegL] = ~m[RegL]; m[RegL] = SignExtend(OverflowCorrected(m[RegL]));
            break;
          }
          ww = this.find(a12);
          m[RegL] = a12 < REG16 ? ~m[a12] : ~SignExtend(m[ww]);
          m[RegL] = SignExtend(OverflowCorrected(m[RegL]));
          m[RegA] = a12 < REG16 + 1 ? ~m[a12 - 1] : ~SignExtend(m[ww - 1]);
          if (a12 >= 0o20 && a12 <= 0o23) this.assign(ww, m[ww]);
          if (a12 >= 0o21 && a12 <= 0o24) this.assign(ww - 1, m[ww - 1]);
          break;
        case 0o160: case 0o161:          // SU
          if (a10 === RegA) acc = SignExtend(AGC_M0);
          else if (a10 < REG16) acc = AddSP16(acc, 0o177777 & ~m[a10]);
          else { ww = this.find(a10); acc = AddSP16(acc, SignExtend(NegateSP(m[ww]))); this.assign(ww, m[ww]); }
          m[RegA] = acc;
          break;
        case 0o162: case 0o163: case 0o164: case 0o165: case 0o166: case 0o167:   // BZMF
          if (acc === 0 || (acc & 0o100000)) { this.nextZ = a12; justBZMF = 1; }
          break;
        case 0o170: case 0o171: case 0o172: case 0o173: case 0o174: case 0o175: case 0o176: case 0o177: {   // MP
          let ms, ls;
          ww = this.find(a12);
          op16 = OverflowCorrected(acc);
          const other = a12 < REG16 ? OverflowCorrected(m[a12]) : m[ww];
          if (other === AGC_P0 || other === AGC_M0) ms = ls = AGC_P0;
          else if (op16 === AGC_P0 || op16 === AGC_M0) {
            if ((op16 === AGC_P0 && (0o40000 & other)) || (op16 === AGC_M0 && !(0o40000 & other))) ms = ls = AGC_M0;
            else ms = ls = AGC_P0;
          } else {
            let p = agc2cpu(SignExtend(op16)) * agc2cpu(SignExtend(other));
            p = cpu2agc2(p);
            if (0o2000000000 & p) p |= 0o4000000000;
            const pr = DecentToSp(p); ms = pr[0]; ls = pr[1];
          }
          m[RegA] = SignExtend(ms); m[RegL] = SignExtend(ls);
          break;
        }
      }
      this.allDone(currentEB, currentFB, currentBB, keepExtraCode, executedTC, tcTransient, justBZF, justBZMF);
    }

    resume() {
      this.nextZ = this.m[RegZRUPT] - 1;
      this.inIsr = 0;
      this.substitute = 1;
    }

    allDone(currentEB, currentFB, currentBB, keepExtraCode, executedTC, tcTransient, justBZF, justBZMF) {
      if (this.pendFlag) return;
      const m = this.m;
      m[RegZERO] = AGC_P0;
      this.outputChannel7 &= 0o160; this.ch[7] = this.outputChannel7;
      m[RegZ] = this.nextZ;
      if (!this.substitute) m[RegZ] &= 0o7777;
      if (!keepExtraCode) this.extraCode = 0;
      if (currentBB !== m[RegBB]) { m[RegFB] = m[RegBB] & 0o76000; m[RegEB] = (m[RegBB] & 0o7) << 8; }
      else if (currentEB !== m[RegEB] || currentFB !== m[RegFB]) m[RegBB] = (m[RegFB] & 0o76000) | ((m[RegEB] & 0o3400) >> 8);
      m[RegEB] &= 0o3400; m[RegFB] &= 0o76000; m[RegBB] &= 0o76007;
      m[RegL] = SignExtend(OverflowCorrected(m[RegL]));
      if (this.inIsr) this.noRupt = 0; else this.ruptLock = 0;
      if (executedTC || tcTransient) this.noTC = 0;
      if (!executedTC) this.tcTrap = 0;
      this.tookBZF = justBZF; this.tookBZMF = justBZMF;
    }

    run(n) { for (let i = 0; i < n; i++) this.cycle(); }

    // ---- DSKY decoding (relay words written to channel 0o10) ----
    dskyState() {
      const D = { 0: '', 21: '0', 3: '1', 25: '2', 27: '3', 15: '4', 30: '5', 28: '6', 19: '7', 29: '8', 31: '9' };
      const r = this.out10, dig = v => D[v & 0o37] !== undefined ? D[v & 0o37] : ' ';
      const L = v => dig(v >> 5), R = v => dig(v);
      const s = (pRow, mRow) => { const p = r[pRow] & 0o2000, n = r[mRow] & 0o2000; return p && !n ? '+' : n && !p ? '-' : ' '; };
      const blankOr = c => c === '' ? ' ' : c;
      const st = {
        prog: blankOr(L(r[11])) + blankOr(R(r[11])),
        verb: blankOr(L(r[10])) + blankOr(R(r[10])),
        noun: blankOr(L(r[9])) + blankOr(R(r[9])),
        r1: s(5 + 2, 6) + [R(r[8]), L(r[7]), R(r[7]), L(r[6]), R(r[6])].map(blankOr).join(''),
        r2: s(5, 4) + [L(r[5]), R(r[5]), L(r[4]), R(r[4]), L(r[3])].map(blankOr).join(''),
        r3: s(2, 1) + [R(r[3]), L(r[2]), R(r[2]), L(r[1]), R(r[1])].map(blankOr).join(''),
      };
      const l12 = r[12], c11 = this.ch[0o11], c163 = this.dsky163;
      st.lamps = {
        uplink: !!(c11 & 0o4), compActy: !!(c11 & 0o2), temp: !!(c163 & DSKY_TEMP),
        noAtt: !!(l12 & 0o10), gimbal: !!(l12 & 0o40), prog: !!(l12 & 0o400), restart: !!(c163 & DSKY_RESTART),
        tracker: !!(l12 & 0o200), alt: !!(l12 & 0o20), vel: !!(l12 & 0o4), prio: !!(l12 & 0o1), noDap: !!(l12 & 0o2),
        stby: !!(c163 & DSKY_STBY), keyRel: !!(c163 & DSKY_KEY_REL), oprErr: !!(c163 & DSKY_OPER_ERR),
        agcWarn: !!(c163 & DSKY_AGC_WARN),
      };
      st.vnBlank = !!(c163 & DSKY_VN_FLASH);
      st.elOff = !!(c163 & DSKY_EL_OFF);
      return st;
    }

    // Rope address (bank*1024 + offset) of the instruction that just executed.
    get ropePC() { return this.pcIdx >= FIX ? this.pcIdx - FIX : -1; }
    // Read a word the way the program would, given a 12-bit address and the current banks.
    peek(a12) { return this.m[this.find(a12)]; }
    peekRope(r) { return this.m[FIX + r]; }
  }

  AGC.FIX = FIX;
  AGC.KEYS = { '0': 0o20, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 0o10, '9': 0o11,
    VERB: 0o21, NOUN: 0o37, '+': 0o32, '-': 0o33, CLR: 0o36, KEYREL: 0o31, ENTR: 0o34, RSET: 0o22 };
  root.AGC = AGC;
  if (typeof module !== 'undefined') module.exports = AGC;
})(typeof self !== 'undefined' ? self : this);
