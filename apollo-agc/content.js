// Lessons, guided code tour and reference text for the Apollo AGC app.
'use strict';

const PROGRAMS = {
  luminary099: {
    name: 'Luminary 099', craft: 'LM', crew: 'Eagle', short: 'LM · Eagle',
    blurb: 'Lunar Module computer software flown on Apollo 11 (Eagle).',
    progs: { '00': 'LGC idling', '06': 'PGNCS power down', '12': 'Powered ascent', '20': 'Rendezvous navigation', '30': 'External delta-V', '40': 'DPS thrusting', '41': 'RCS thrusting', '42': 'APS thrusting', '47': 'Thrust monitor', '51': 'IMU orientation determination', '52': 'IMU realign', '57': 'Lunar surface align', '63': 'Landing: braking phase', '64': 'Landing: approach phase', '66': 'Landing: rate of descent', '68': 'Landing confirmation', '70': 'DPS abort', '71': 'APS abort' },
  },
  comanche055: {
    name: 'Comanche 055', craft: 'CM', crew: 'Columbia', short: 'CM · Columbia',
    blurb: 'Command Module computer software flown on Apollo 11 (Columbia), also called Colossus 2A.',
    progs: { '00': 'CMC idling', '01': 'Prelaunch initialization', '02': 'Gyrocompassing', '06': 'GNCS power down', '11': 'Earth orbit insertion monitor (Saturn V launch)', '15': 'TLI initiate/cutoff', '20': 'Rendezvous navigation', '22': 'Orbital navigation', '30': 'External delta-V', '40': 'SPS thrusting', '41': 'RCS thrusting', '47': 'Thrust monitor', '51': 'IMU orientation determination', '52': 'IMU realign', '61': 'Entry: preparation', '62': 'Entry: CM/SM separation', '63': 'Entry: initialization', '64': 'Entry: post 0.05 G', '67': 'Entry: final phase' },
  },
};

// Plain-language notes for routines that show up in the live view.
const ROUTINE_NOTES = {
  ADVAN: 'Executive idle loop: no job is waiting, so the computer spins here.',
  DUMMYJOB: 'Executive: nothing to do, turn off COMP ACTY and idle.',
  SUPDXCHZ: 'Executive: switching banks to run the next job (or self-check).',
  POSTJUMP: 'Jump to another memory bank.', BANKJUMP: 'Jump to another memory bank.',
  'Q+10000': 'Bank-switch helper.', PRIO12: 'Bank-switch helper.',
  SMODECHK: 'Self-check: runs in the idle time to test the computer.', CHECKNJ: 'Self-check: is there a new job yet?', SELFCHK: 'Self-check entry ("CHARLEY, COME IN HERE").',
  T4RUPT: 'T4RUPT: every 120 ms, drives the DSKY relays and watches the IMU.', DSPOUT: 'T4RUPT: sending a display word to the DSKY relays.',
  DODOWNTM: 'DOWNRUPT: telemetry word to Mission Control every 20 ms.', FETCH2WD: 'Telemetry: fetching two words to send to the ground.', WOTEST: 'Telemetry list processing.',
  CHARIN: 'PINBALL: handling a key you pressed.', CHARIN2: 'PINBALL: handling a key you pressed.', MONDO: 'PINBALL: refreshing a monitor display (V16).', MONREQ: 'PINBALL: once-a-second monitor task.',
  DSPIN: 'PINBALL: putting digits into the display table.', DSPIN1: 'PINBALL: putting digits into the display table.',
  KEYRUPT1: 'Keyboard interrupt: a DSKY key was pressed.', T3RUPT: 'T3RUPT: time to run the next Waitlist task.', T3RUPT2: 'T3RUPT: dispatching a Waitlist task.',
  NOVAC: 'Executive: queue a new job (needs a core set).', FINDVAC: 'Executive: queue a job that also needs a VAC area.', WAITLIST: 'Waitlist: schedule a task to run later.',
  INTPRET: 'The Interpreter: a virtual machine for vector/matrix math.', DMPSUB2: 'Interpreter: double-precision multiply.',
  QERRCALC: 'LM digital autopilot: attitude error calculation.', NOQBRSM: 'Waitlist bookkeeping.',
  BAILOUT: 'Software restart after a serious alarm.', BAILOUT1: 'Software restart after a serious alarm (e.g. 1202).', ALARM: 'Program alarm: light PROG and store the code.',
  GOPROG: 'Restart: recover from a hardware or software restart.', SLAP1: 'Fresh start.', VBTSTLTS: 'V35 lamp test.',
};

const HOOKS = ['NOVAC', 'FINDVAC', 'WAITLIST', 'LONGCALL', 'ALARM', 'BAILOUT', 'BAILOUT1', 'POODOO', 'POODOO1', 'SLAP1', 'GOPROG'];

const RUPTS = ['', 'T6RUPT', 'T5RUPT', 'T3RUPT', 'T4RUPT', 'KEYRUPT1', 'KEYRUPT2', 'UPRUPT', 'DOWNRUPT', 'RADARUPT', 'HANDRUPT'];
const RUPT_NOTES = {
  T6RUPT: 'RCS jet timing', T5RUPT: 'Digital autopilot', T3RUPT: 'Waitlist tasks', T4RUPT: 'DSKY & IMU, 120 ms',
  KEYRUPT1: 'Keystrokes', DOWNRUPT: 'Telemetry, 20 ms', UPRUPT: 'Uplink from ground', RADARUPT: 'Radar data', HANDRUPT: 'Hand controller', KEYRUPT2: 'Nav DSKY keys',
};

// ---------------------------------------------------------------------------
// Lessons. Each step: text (HTML), optional keys (hint), check(s, x) → bool,
// inside (HTML shown after success), code: {file, label|line} link, action.
const K = (...k) => k.map(x => `<kbd>${x}</kbd>`).join('');
const LESSONS = [
  {
    id: 'meet', title: 'Meet the DSKY', sub: 'Your station: lamps, display, keyboard.',
    steps: [
      { text: `<p>This is the <b>DSKY</b> ("disky": DiSplay and KeYboard). It's how Neil Armstrong and Buzz Aldrin talked to the Apollo Guidance Computer in Eagle, and how Michael Collins flew Columbia.</p><p>The computer behind it is running the real Apollo 11 software, instruction by instruction.</p>`, focus: 'dsky' },
      { text: `<p><b>Left: warning and status lamps.</b> White lamps are status (KEY REL, OPR ERR…); amber are cautions (PROG = program alarm, RESTART = the computer restarted).</p>`, focus: 'lamps' },
      { text: `<p><b>Right: the green display.</b> <b>PROG</b> is the running program (the "major mode"). <b>VERB</b> is the action, <b>NOUN</b> is the data. <b>R1, R2, R3</b> are three five-digit registers with a sign. <b>COMP ACTY</b> glows whenever the computer is busy with a job.</p>`, focus: 'el' },
      { text: `<p><b>The keyboard.</b> You talk in a little grammar: ${K('VERB')} two digits, ${K('NOUN')} two digits, then ${K('ENTR')}. "Verb 16 Noun 36 Enter" means "monitor the clock".</p><p>${K('PRO')} = proceed, ${K('KEY REL')} = give the display back to the computer, ${K('RSET')} = clear warning lamps, ${K('CLR')} = clear what you typed.</p>`, focus: 'keys' },
      { text: `<p>That's the whole interface. Every lesson from here makes you key real commands, and the <b>Inside the AGC</b> panel below the DSKY shows what the software did about them.</p>` },
    ],
  },
  {
    id: 'alarm', title: 'Why are the lamps on?', sub: 'Read the power-up alarm code with V05 N09.',
    steps: [
      { text: `<p>When you open the app the computer has just powered up, and <b>RESTART</b> and <b>PROG</b> are lit. Ask it why: display the alarm codes.</p><p>Key ${K('VERB', '0', '5', 'NOUN', '0', '9', 'ENTR')}</p>`, keys: ['VERB', '0', '5', 'NOUN', '0', '9', 'ENTR'],
        check: s => s.verb === '05' && s.noun === '09',
        inside: `R1 shows <b>01107</b>: PHASE TABLE FAILURE (the live panel below quotes the program's own description). At power-up the memory held no saved restart state, so the software refused to trust it and did a <b>fresh start</b>. If R1 shows something else, that's the alarm the computer raised most recently.`,
        code: { file: 'FRESH_START_AND_RESTART.agc', label: 'GOPROG' } },
      { text: `<p>Now clear the lamps. Press ${K('RSET')}.</p>`, keys: ['RSET'],
        check: s => !s.lamps.prog && !s.lamps.restart,
        inside: `RSET is just another key: KEYRUPT1 fires, PINBALL's CHARIN job sees the RSET code and turns PROG off. The RESTART lamp is wired straight to the RSET key in hardware.` },
    ],
  },
  {
    id: 'lamps', title: 'Lamp test', sub: 'V35: light every lamp on the panel.',
    steps: [
      { text: `<p>Before trusting a panel, test it. Key ${K('VERB', '3', '5', 'ENTR')}</p>`, keys: ['VERB', '3', '5', 'ENTR'],
        check: s => s.verb === '88' && s.noun === '88',
        inside: `Verb 35 runs <b>VBTSTLTS</b> in PINBALL. It sets the lamp bits in output channels 11 and 13 and fills the display table DSPTAB with 8s. T4RUPT then sends that table to the DSKY's relays, one word at a time, which is why the digits fill in over a second.`,
        code: { file: 'PINBALL_GAME__BUTTONS_AND_LIGHTS.agc', label: 'VBTSTLTS' } },
      { text: `<p>Wait about five seconds and watch the lamps.</p>`, check: (s, x) => s.verb === '88' && !s.lamps.prog && !s.lamps.temp && x.stepSecs > 3,
        inside: `VBTSTLTS put the task <b>TSTLTS2</b> on the <b>Waitlist</b> with a delay of SHOLTS = 764 octal centiseconds: 5 seconds. When TIME3 overflowed, T3RUPT ran the task, which turned the caution lamps off. The 88s stay until you key something new.` },
    ],
  },
  {
    id: 'clock', title: 'Mission clock', sub: 'V16 N36: watch the AGC clock tick.',
    steps: [
      { text: `<p>Show the computer's clock. Key ${K('VERB', '1', '6', 'NOUN', '3', '6', 'ENTR')}</p>`, keys: ['VERB', '1', '6', 'NOUN', '3', '6', 'ENTR'],
        check: s => s.verb === '16' && s.noun === '36',
        inside: `Verb 16 = MONITOR DECIMAL, Noun 36 = TIME OF AGC CLOCK. R1 = hours, R2 = minutes, R3 = seconds with hundredths.` },
      { text: `<p>Look at the <b>event log</b> under the DSKY. Once a second a <b>MONREQ</b> task fires and queues a <b>MONDO</b> job.</p>`, check: (s, x) => x.stepSecs > 2.5,
        inside: `That's the AGC's two schedulers working together. The <b>Waitlist</b> runs short tasks at exact times from the T3RUPT timer interrupt. Tasks must be quick, so anything longer is handed to the <b>Executive</b> as a job with a priority. MONDO is that job: it reads TIME2/TIME1, converts to decimal and updates the display.`,
        code: { file: 'PINBALL_GAME__BUTTONS_AND_LIGHTS.agc', label: 'MONREQ' } },
    ],
  },
  {
    id: 'setclock', title: 'Load data', sub: 'V25 N36: set the clock, like a real crew update.',
    steps: [
      { text: `<p>Verb 25 means "load three registers". Key ${K('VERB', '2', '5', 'NOUN', '3', '6', 'ENTR')}</p>`, keys: ['VERB', '2', '5', 'NOUN', '3', '6', 'ENTR'],
        check: s => s.verb === '21',
        inside: `The verb changed to a <b>flashing 21</b>: the computer is asking you for R1. Flashing verb/noun always means "your turn".` },
      { text: `<p>Hours first. Decimal numbers need a sign, then five digits: ${K('+', '0', '0', '0', '1', '2', 'ENTR')}</p>`, keys: ['+', '0', '0', '0', '1', '2', 'ENTR'],
        check: s => s.verb === '22', inside: `The sign tells PINBALL the number is decimal; without it, digits are read as octal.` },
      { text: `<p>Minutes: ${K('+', '0', '0', '0', '3', '4', 'ENTR')}</p>`, keys: ['+', '0', '0', '0', '3', '4', 'ENTR'], check: s => s.verb === '23' },
      { text: `<p>Seconds (with two decimals): ${K('+', '0', '0', '0', '0', '0', 'ENTR')}</p>`, keys: ['+', '0', '0', '0', '0', '0', 'ENTR'],
        check: (s, x) => s.verb === '23' && !x.flash, inside: `PINBALL converted your three numbers to binary and wrote them into TIME2 and TIME1, the clock counters.` },
      { text: `<p>Check it: ${K('VERB', '1', '6', 'NOUN', '3', '6', 'ENTR')}</p>`, keys: ['VERB', '1', '6', 'NOUN', '3', '6', 'ENTR'],
        check: s => s.verb === '16' && s.noun === '36' && s.r1 === '+00012', inside: `The clock now reads 12 h 34 min and keeps counting from there. Crews loaded state vectors and burn targets the same way, five digits at a time.` },
    ],
  },
  {
    id: 'oprerr', title: 'Operator error', sub: 'What happens when you key nonsense.',
    steps: [
      { text: `<p>Verb 39 doesn't exist. Key it anyway: ${K('VERB', '3', '9', 'ENTR')}</p>`, keys: ['VERB', '3', '9', 'ENTR'],
        check: (s, x) => x.seen.oprErr, inside: `PINBALL looked up verb 39, found no routine for it, and lit <b>OPR ERR</b> (operator error). The display keeps what you typed so you can see the mistake.` },
      { text: `<p>Clear it with ${K('RSET')}</p>`, keys: ['RSET'], check: (s, x) => !(x.ch11 & 0o100) && x.stepSecs > 0.3 },
    ],
  },
  {
    id: 'p00', title: 'Change program', sub: 'V37: select a major mode.',
    steps: [
      { text: `<p>Every phase of the mission is a numbered program. Verb 37 changes it. Key ${K('VERB', '3', '7', 'ENTR')}</p>`, keys: ['VERB', '3', '7', 'ENTR'],
        check: (s, x) => s.verb === '37' && x.flash, inside: `Flashing V37 with a blank noun: "which program?"` },
      { text: `<p>Program 00 is the idle program (crews called it "POO"). Key ${K('0', '0', 'ENTR')}</p>`, keys: ['0', '0', 'ENTR'],
        check: s => s.prog === '00', inside: `The PROG display now shows 00. During the landing, Aldrin keyed V37 E 63 E to start P63, the braking phase. The landing programs can't run here because there is no simulated spacecraft (engines, IMU, radar) around the computer.`,
        code: { file: 'THE_LUNAR_LANDING.agc', label: 'P63LM', craft: 'LM' } },
    ],
  },
  {
    id: 'standby', title: 'Put the computer to sleep', sub: 'P06 and the PRO key: a real power-down.',
    steps: [
      { text: `<p>Select program 06: ${K('VERB', '3', '7', 'ENTR', '0', '6', 'ENTR')}</p>`, keys: ['VERB', '3', '7', 'ENTR', '0', '6', 'ENTR'],
        check: s => s.prog === '06' && s.verb === '50',
        inside: `Flashing <b>V50 N25</b> means "please perform this checklist item". R1 = <b>00062</b>: AGC POWER DOWN. P06 has also set the "standby allowed" bit in output channel 13.`,
        code: { file: 'IMU_MODE_SWITCHING_ROUTINES.agc', label: 'P06' } },
      { text: `<p>Press and <b>hold ${K('PRO')} for 2 seconds</b>.</p>`, hold: 'PRO',
        check: s => s.lamps.stby,
        inside: `Holding PRO for more than 1.28 s tripped the hardware standby circuit. The CPU stopped executing; only the timers keep counting. The STBY lamp is on and the display is dark.` },
      { text: `<p>Wake it up: <b>hold ${K('PRO')} again</b> for 2 seconds.</p>`, hold: 'PRO',
        check: (s, x) => !s.lamps.stby && s.verb === '37' && x.stepSecs > 1,
        inside: `Waking up forces a hardware restart (GOJAM to address 4000). The restart code finds the phase P06 left behind (POSTAND), corrects the clock for the time asleep, and asks you which program to run next.`,
        code: { file: 'FRESH_START_AND_RESTART.agc', label: 'GOPROG' } },
      { text: `<p>Answer with program 00: ${K('0', '0', 'ENTR')}</p>`, keys: ['0', '0', 'ENTR'], check: s => s.prog === '00' },
    ],
  },
  {
    id: 'peek', title: 'Peek into the core rope', sub: 'V27 N02: read a word of fixed memory.',
    steps: [
      { text: `<p>The program is woven into <b>core rope</b> memory: copper wire threaded through or around magnetic cores, 36,864 words, impossible to change in flight. Read one word. Key ${K('VERB', '2', '7', 'NOUN', '0', '2', 'ENTR')}</p>`, keys: ['VERB', '2', '7', 'NOUN', '0', '2', 'ENTR'],
        check: (s, x) => s.verb === '27' && x.flash, inside: `Flashing: "give me an address" (Noun 02 = machine address, in octal).` },
      { text: `<p>Address 4000 is where every restart begins. Key ${K('4', '0', '0', '0', 'ENTR')}</p>`, keys: ['4', '0', '0', '0', 'ENTR'],
        check: s => s.verb === '27' && s.r1.trim() === '00004',
        inside: `R1 = <b>00004</b>, the instruction <b>INHINT</b> (inhibit interrupts). Octal, because the AGC was built and programmed in octal.`,
        code: { file: 'INTERRUPT_LEAD_INS.agc', rope: 2 * 1024 } },
      { text: `<p>Now read a timer that counts every 10 ms. Key ${K('VERB', '1', '1', 'NOUN', '0', '1', 'ENTR')} then ${K('2', '5', 'ENTR')} (address 25 = TIME1).</p>`, keys: ['VERB', '1', '1', 'NOUN', '0', '1', 'ENTR', '2', '5', 'ENTR'],
        check: s => s.verb === '11' && s.r3.trim().startsWith('25'),
        inside: `Verb 11 = MONITOR OCTAL. R1 shows TIME1 as the raw counter, updated once a second. The hardware adds 1 to it every 10 ms, between instructions, without the program doing anything.` },
    ],
  },
  {
    id: 'a1202', craft: 'LM', title: 'Recreate the 1202 alarm', sub: 'Overload the Executive like on July 20, 1969 (Eagle).',
    steps: [
      { text: `<p>About seven minutes before touchdown, Eagle's computer flashed <b>1202</b>, and later 1201. The rendezvous-radar interface was stealing memory cycles, and the landing software already kept the CPU about 85% busy. Let's do the same to this computer.</p><p>First give it steady work: ${K('VERB', '1', '6', 'NOUN', '3', '6', 'ENTR')}</p>`, keys: ['VERB', '1', '6', 'NOUN', '3', '6', 'ENTR'], check: s => s.verb === '16' && s.noun === '36' },
      { text: `<p>Turn on cycle stealing: this sends counter pulses that take memory cycles away from the program, the same mechanism as the radar's.</p>`, action: { label: 'Steal 88% of cycles', steal: 0.88 }, gauge: true,
        check: (s, x) => x.steal >= 0.8, inside: `Watch the <b>core sets</b> gauge: each job needs one, and there are only 8. Right now they're nearly all free.` },
      { text: `<p>Now pile on jobs: <b>tap number keys as fast as you can</b>, 30 times or so. Every keystroke is a new CHARIN job. (Or let the button do the mashing.)</p>`, action: { label: 'Mash keys for me', mash: 40 }, gauge: true,
        check: (s, x) => x.events.some(e => e.alarm === '1202'),
        inside: `<b>1202: EXECUTIVE OVERFLOW, NO CORE SETS.</b> NOVAC found every core set taken, called <b>BAILOUT</b>, and the software restarted itself: it threw away all jobs and rebuilt only the protected ones from its restart tables. The computer never crashed. That design by Hamilton's team is why Mission Control could call "GO" on that alarm.`,
        code: { file: 'EXECUTIVE.agc', label: 'NEXTCORE' } },
      { text: `<p>Stop the stealing, then read the code: ${K('VERB', '0', '5', 'NOUN', '0', '9', 'ENTR')}</p>`, action: { label: 'Stop stealing', steal: 0 }, keys: ['VERB', '0', '5', 'NOUN', '0', '9', 'ENTR'],
        check: (s, x) => s.verb === '05' && s.noun === '09' && x.steal === 0,
        inside: `One of R1–R3 holds <b>01202</b>. Press RSET to clear PROG. On Apollo 11 the same code appeared on Aldrin's DSKY, and the computer kept steering the landing while it restarted.` },
    ],
  },
  {
    id: 'fresh', title: 'Fresh start', sub: 'V36: wipe the software state on purpose.',
    steps: [
      { text: `<p>Verb 36 requests a fresh start: every job, task and display is dropped. Key ${K('VERB', '3', '6', 'ENTR')}</p>`, keys: ['VERB', '3', '6', 'ENTR'],
        check: (s, x) => x.events.some(e => e.name === 'SLAP1'),
        inside: `PINBALL jumped to <b>SLAP1</b> in FRESH_START_AND_RESTART.agc. It reset the timers, emptied the Waitlist and Executive, turned lamps off and went to P00 idle with a blank display. Crews used it when the computer state was hopelessly confused.`,
        code: { file: 'FRESH_START_AND_RESTART.agc', label: 'SLAP1' } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Guided tour of the source. craft: which program's source (LM = Luminary 099, CM = Comanche 055).
const TOUR = [
  { craft: 'LM', file: 'MAIN.agc', label: null, find: '$ASSEMBLY_AND_OPERATION_INFORMATION', span: 12, title: 'The whole program, in order',
    html: `<p>MAIN.agc is the table of contents: each <code>$FILE.agc</code> line pulls in one section of the printout, with its page numbers. Luminary 099 is about 1,500 pages of source and 36,864 words of rope.</p><p>Every line you read in this app is a transcription of MIT's printout. Lines starting with <code>##</code> are notes added by the volunteers who transcribed it; single <code>#</code> comments are the original programmers'.</p>` },
  { craft: 'CM', file: 'CONTRACT_AND_APPROVALS.agc', find: 'SUBMITTED:', span: 4, title: "Margaret Hamilton's signature",
    html: `<p>The Command Module program opens with its sign-off page: <b>Margaret H. Hamilton, Colossus Programming Leader</b>, 28 March 1969. Hamilton led the MIT team writing the command module software and later directed the on-board flight software for both spacecraft. She is credited with coining the term "software engineering", to give the work the same standing as hardware engineering.</p>` },
  { craft: 'LM', file: 'INTERRUPT_LEAD_INS.agc', find: 'SETLOC\t4000', span: 10, title: 'Address 4000: where everything starts',
    html: `<p>When power comes on, or the hardware detects trouble, the CPU is forced (GOJAM) to address 4000. Four instructions: inhibit interrupts, set the bank, jump to <b>GOPROG</b>.</p><p>Below it are the interrupt vectors: four words each for T6RUPT, T5RUPT, T3RUPT, T4RUPT, KEYRUPT1… When an interrupt fires, the CPU saves its place and jumps here.</p>` },
  { craft: 'LM', file: 'FRESH_START_AND_RESTART.agc', label: 'GOPROG', span: 8, title: 'Restart protection',
    html: `<p>GOPROG counts the restart, then checks the <b>phase tables</b>: every important program records "how far it got" with PHASCHNG. After a restart the software resumes each protected job from its last phase instead of starting over. That design turned the 1202 alarms during the landing into short hiccups instead of an abort.</p>` },
  { craft: 'LM', file: 'EXECUTIVE.agc', label: 'NOVAC', span: 14, title: 'The Executive: jobs by priority',
    html: `<p>The AGC multitasked with a tiny operating system. A routine calls <b>NOVAC</b> (or FINDVAC if it needs scratch space) with a priority and the job's address. The Executive gives it a <b>core set</b>, 12 words that hold the job's registers.</p><p>Jobs don't share time slices: the highest-priority job runs until it ends or yields. Watch the event log: every key you press creates a CHARIN job here.</p>` },
  { craft: 'LM', file: 'EXECUTIVE.agc', label: 'NOVAC2', span: 10, title: 'Only 8 core sets',
    html: `<p><code>NO.CORES DEC 7</code>: the loop counts 7 down to 0, so there are 8 core sets (the comment says "seven", which is one of the printout's small surprises). There is no way to wait for one to become free.</p>` },
  { craft: 'LM', file: 'EXECUTIVE.agc', label: 'NEXTCORE', span: 8, title: '1202 lives here',
    html: `<p>If every core set is busy, NOVAC falls through to <code>TC BAILOUT1</code> followed by <code>OCT 1202</code>: <b>Executive overflow, no core sets</b>. A few lines above is the 1201 (no VAC areas). These two alarms flashed on Eagle's DSKY during the descent. Try lesson "Recreate the 1202 alarm" to trigger this very instruction.</p>` },
  { craft: 'LM', file: 'EXECUTIVE.agc', label: 'DUMMYJOB', span: 9, title: 'Idle, and the COMP ACTY lamp',
    html: `<p>When no job is waiting, the Executive turns the COMP ACTY lamp off (<code>WAND DSALMOUT</code> clears bit 2 of channel 11) and loops at <b>ADVAN</b>, checking NEWJOB. The CPU load meter in this app is literally that lamp's duty cycle.</p>` },
  { craft: 'LM', file: 'AGC_BLOCK_TWO_SELF-CHECK.agc', label: 'SELFCHK', span: 3, title: '"CHARLEY, COME IN HERE"',
    html: `<p>Idle time isn't wasted: the backup idle loop runs <b>self-check</b>, testing instructions and memory. The comment is a programmer's note left in flight code. In the Inside panel, SMODECHK and CHECKNJ are the top routines whenever the computer has nothing else to do.</p>` },
  { craft: 'LM', file: 'WAITLIST.agc', label: 'WAITLIST', span: 10, title: 'The Waitlist: tasks on a timer',
    html: `<p>For things that must happen at an exact time, a program calls <b>WAITLIST</b> with a delay in centiseconds. The list is kept sorted, and TIME3 is set to overflow when the first task is due. The overflow raises <b>T3RUPT</b>, which runs the task. Tasks are short (at most a few milliseconds) and usually hand longer work to the Executive.</p>` },
  { craft: 'LM', file: 'KEYRUPT,_UPRUPT.agc', label: 'KEYRUPT1', span: 18, title: 'What a key press does',
    html: `<p>Pressing a key puts a 5-bit code in input channel 15 and raises KEYRUPT1. This interrupt routine reads the code and asks the Executive for a <b>CHARIN</b> job (<code>TC NOVAC / 2CADR CHARIN</code>), then RESUMEs whatever was running. The rest happens in the job, outside the interrupt.</p>` },
  { craft: 'LM', file: 'PINBALL_GAME__BUTTONS_AND_LIGHTS.agc', find: 'PROGRAM NAME - KEYBOARD AND DISPLAY PROGRAM', span: 8, title: 'PINBALL GAME BUTTONS AND LIGHTS',
    html: `<p>The keyboard and display software was officially named "PINBALL GAME BUTTONS AND LIGHTS". It parses verbs and nouns, converts between decimal, octal and binary, flashes requests, and drives the relays behind every digit.</p>` },
  { craft: 'LM', file: 'PINBALL_GAME__BUTTONS_AND_LIGHTS.agc', label: 'VBTSTLTS', span: 12, title: 'Verb 35, the lamp test',
    html: `<p>Here's the code you ran in the lamp-test lesson. It sets all the lamp bits, fills the display with 8s, and schedules a Waitlist task to turn the cautions off after 5 seconds.</p>` },
  { craft: 'LM', file: 'T4RUPT_PROGRAM.agc', label: 'PROCEEDE', span: 10, title: 'The PRO key is polled',
    html: `<p>Most keys interrupt the CPU, but PRO doesn't: T4RUPT checks channel 32 bit 14 every 120 ms. The comment notes the check costs 9 memory cycles, about 108 microseconds: programmers counted every cycle.</p>` },
  { craft: 'LM', file: 'ALARM_AND_ABORT.agc', label: 'ALARM', span: 10, title: 'Program alarms',
    html: `<p><code>TC ALARM</code> followed by an octal code lights PROG and saves the code for V05 N09. BAILOUT and POODOO do the same and also restart the software or abort the program.</p>` },
  { craft: 'LM', file: 'ASSEMBLY_AND_OPERATION_INFORMATION.agc', find: '# 01201', span: 3, title: 'The alarm catalogue',
    html: `<p>The program's own documentation lists every alarm. 1201 and 1202 are both marked "EXEC". Mission Control's Jack Garman had a hand-written list of these codes, which is how the team could call "GO" within seconds.</p>` },
  { craft: 'LM', file: 'INTERPRETER.agc', label: 'INTPRET', span: 12, title: 'A computer inside the computer',
    html: `<p>The AGC hardware only did single-precision integer arithmetic. Navigation needs vectors, matrices and double precision, so MIT wrote an <b>interpreter</b>: a virtual machine with its own compact instruction set (DLOAD, VXV, UNIT…). It's slower but saves precious rope. Most guidance equations are written in interpretive code.</p>` },
  { craft: 'LM', file: 'THE_LUNAR_LANDING.agc', label: 'P63LM', span: 10, title: 'P63: the landing begins',
    html: `<p>V37 E 63 E started this. P63 checks the IMU, points WHICH at its ignition table and hands control to BURNBABY, the master ignition routine. P64 and P66 follow as the LM pitches over and Armstrong takes manual control of the rate of descent.</p>` },
  { craft: 'LM', file: 'BURN,_BABY,_BURN_--_MASTER_IGNITION_ROUTINE.agc', find: 'THE MASTER IGNITION ROUTINE WAS CONCEIVED', span: 9, title: 'BURN, BABY, BURN',
    html: `<p>The master ignition routine got its name from a 1960s DJ catchphrase. Its authors (Don Eyles and Peter Adler) signed it with <i>Honi soit qui mal y pense</i> ("shame on whoever thinks ill of it") and labeled the tables <i>Noli se tangere</i>: "don't touch".</p>` },
  { craft: 'LM', file: 'BURN,_BABY,_BURN_--_MASTER_IGNITION_ROUTINE.agc', label: 'P40AUTO', span: 22, title: '"HELLO THERE." … "GOODBYE. COME AGAIN SOON."',
    html: `<p>Comments in flight code could be playful. P40AUTO greets the caller and says goodbye when it jumps away for good.</p>` },
  { craft: 'LM', file: 'LUNAR_LANDING_GUIDANCE_EQUATIONS.agc', find: 'TEMPORARY, I HOPE HOPE HOPE', span: 2, title: '"TEMPORARY, I HOPE HOPE HOPE"',
    html: `<p>A quick fix that flew to the Moon. Every programmer recognises this comment.</p>` },
  { craft: 'LM', file: 'LUNAR_LANDING_GUIDANCE_EQUATIONS.agc', label: 'STARTP66', span: 6, title: 'P66: Armstrong takes over',
    html: `<p>When Armstrong saw the automatic target was a boulder field, he switched the attitude control to manual. That moved the computer into P66, rate of descent: each click of a switch changed the descent rate by one foot per second while the computer kept the LM stable.</p>` },
  { craft: 'LM', file: 'SERVICER.agc', label: 'SERVICER', span: 8, title: 'SERVICER: the 2-second heartbeat',
    html: `<p>During powered flight, SERVICER runs every two seconds: it reads the accelerometers, updates position and velocity (average-G integration), processes landing-radar data and calls the guidance equations. Together with the displays, this kept the CPU about 85% busy during the descent, which is why the radar's stolen cycles were enough to cause 1202s.</p>` },
  { craft: 'LM', file: 'DOWN-TELEMETRY_PROGRAM.agc', label: 'DODOWNTM', span: 8, title: 'Talking to Houston',
    html: `<p>Every 20 ms DOWNRUPT sends two more words of telemetry from a list of key variables. Mission Control watched those numbers during the descent, which helped them judge the 1202s within seconds.</p>` },
  { craft: 'CM', file: 'P11.agc', find: 'EARTH ORBIT INSERTION MONITOR PROGRAM', span: 14, title: 'P11: riding the Saturn V',
    html: `<p>The Saturn V had its own IBM guidance computer, but the command module's AGC watched the launch in P11, displaying velocity, altitude rate and altitude so the crew could check the rocket's guidance.</p>` },
  { craft: 'CM', file: 'P11.agc', find: 'SATURN TAKEOVER FUNCTION', span: 18, title: 'Steering the Saturn',
    html: `<p>Once in orbit with the S-IVB stage still attached, the astronauts could have the command module computer pass hand-controller commands to the Saturn as rate commands ("Saturn takeover", extended verb 46).</p>` },
];

if (typeof module !== 'undefined') module.exports = { PROGRAMS, LESSONS, TOUR, ROUTINE_NOTES, HOOKS, RUPTS, RUPT_NOTES };
