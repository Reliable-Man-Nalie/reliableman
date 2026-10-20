// ─────────────────────────────────────────────────────────────────────────────
// ALL THE WORDS ON THE PAGE, in both languages.
//   /nalie     English (the main page)
//   /nalie-de  German
// Same layout, same icons, same order: only the words differ. Edit copy here.
// The option VALUES (e.g. 'private') are what qualify() in config.ts reads, so
// they must stay identical in both languages; the labels can change freely.
// ─────────────────────────────────────────────────────────────────────────────

import type { Fit } from './config'

export type Lang = 'en' | 'de'
export type Option = { value: string; label: string; hint?: string }
type TD = { t: string; d: string }

export type Copy = {
  htmlLang: string
  switchLabel: string
  switchHref: string
  switchAria: string
  apply: string
  hero: { eyebrow: string; h1a: string; h1b: string; lede: string; cta: string; coach: string; coachSub: string; loadTitle: string; load: string[]; structure: string; loadFoot: string; loadFootStrong: string; loadAria: string }
  pains: { eyebrow: string; title: string; items: string[]; punch: string; punchStrong: string }
  worlds: { eyebrow: string; title: string; homeH: string; home: string[]; outH: string; out: string[]; you: string; youStrong: string }
  wants: { eyebrow: string; titleA: string; titleB: string; sub: string; items: TD[] }
  pack: { eyebrow: string; title: string; bad: string; badText: string; good: string; goodText: string; badAria: string; goodAria: string; punchA: string; punchStrong: string; punchB: string }
  battery: { eyebrow: string; title: string; aria: string; items: TD[] }
  guide: { eyebrow: string; title: string; text: string; chips: string[]; alt: string }
  house: { eyebrow: string; titleA: string; titleB: string; aria: string; roof: string; base: string; pillars: TD[] }
  plan: { eyebrow: string; title: string; items: TD[] }
  compare: { eyebrow: string; title: string; aria: string; group: string; groupSub: string; vip: string; vipSub: string; rows: string[]; note: string; cta: string }
  futures: { eyebrow: string; title: string; noH: string; yesH: string; before: string[]; after: string[]; punch: string; punchStrong: string }
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] }
  applyBlock: { eyebrow: string; titleA: string; titleB: string; points: string[] }
  footer: string
  form: {
    name: string; namePh: string; phone: string; phonePh: string; email: string; emailPh: string
    ageQ: string; q1: string; q2: string; q3: string; q3Ph: string; q4: string; q5: string; q6: string
    ages: Option[]; situations: Option[]; struggles: Option[]; start: Option[]; invest: Option[]; commit: Option[]
    missing: string; gapNames: string[]; submit: string; sending: string; fine: string
    fitLabel: Record<Fit, string>
    result: Record<Fit, { tag: string; h: string; p: string }>
    brother: string; waStepStrong: string; waStep: string; waButton: string; noWa: string
    msg: { intro: string; name: string; age: string; situation: string; hardest: string; goal: string; start: string; invest: string; commit: string; fits: string }
  }
}

export const COPY: Record<Lang, Copy> = {
  // ═══════════════════════════════════ ENGLISH ═══════════════════════════════════
  en: {
    htmlLang: 'en',
    switchLabel: 'DE',
    switchHref: '/nalie-de',
    switchAria: 'Diese Seite auf Deutsch',
    apply: 'Apply',
    hero: {
      eyebrow: 'For the eldest son who had to grow up too fast',
      h1a: 'Your whole family is counting on you.',
      h1b: 'Become the man who delivers.',
      lede: 'Money. Respect. The right woman. A strong family. You want it all. Reliable Man gives you the structure to carry it without breaking.',
      cta: 'Apply now',
      coach: 'Coaching with Nalie',
      coachSub: '1:1 or in a group · By application only',
      loadTitle: 'Your load today',
      load: ['Family', 'Mum', 'Bills', 'Your future', 'Women'],
      structure: 'Your structure',
      loadFoot: 'All load. Barely any structure.',
      loadFootStrong: 'We change that.',
      loadAria: 'How it feels: your load today',
    },
    pains: {
      eyebrow: 'Sound familiar?',
      title: 'Nobody asked you. You just stepped up.',
      items: [
        'When there is a fire, they call you.',
        'Mum is struggling. You step in.',
        'End of the month. The money is gone.',
        'No plan. Every day is firefighting.',
        'You talk to nobody about it.',
        'Women, friends, dreams: all on hold.',
      ],
      punch: 'Two of these hit home?',
      punchStrong: 'Then this is for you, brother.',
    },
    worlds: {
      eyebrow: 'Two worlds',
      title: 'At home, family comes first. Out there, results count.',
      homeH: 'At home',
      home: ['Family first', 'Respect for your parents', 'Loyalty'],
      outH: 'Out there',
      out: ['Speed', 'Money and status', 'Results'],
      you: 'You stand in between.',
      youStrong: 'Nobody showed you how to carry both.',
    },
    wants: {
      eyebrow: 'What you really want',
      titleA: 'You want it all.',
      titleB: 'And you should.',
      sub: 'No either-or. Success and family. Wealth and loyalty.',
      items: [
        { t: 'Wealth', d: 'Your own money. Not just for the family. For you too.' },
        { t: 'Respect', d: 'When you speak, people listen.' },
        { t: 'Attraction', d: 'A man with a plan and calm draws women in.' },
        { t: 'Strong family', d: 'Mum does not have to worry anymore.' },
        { t: 'Pride', d: 'You recognise the man in the mirror again.' },
        { t: 'Freedom', d: 'Time for yourself. Without the guilt.' },
      ],
    },
    pack: {
      eyebrow: 'Picture a backpack',
      title: 'Same weight. Different life.',
      bad: 'No straps',
      badText: 'Crooked. Painful. You will not last.',
      good: 'With straps',
      goodText: 'Upright. Strong. You keep going.',
      badAria: 'A man with a backpack without straps, bent over',
      goodAria: 'A man with a backpack with straps, standing tall',
      punchA: 'The weight is not the problem.',
      punchStrong: 'You are missing the straps.',
      punchB: 'Reliable Man gives you the straps.',
    },
    battery: {
      eyebrow: 'What it is costing you',
      title: 'You have been running on 5% for years.',
      aria: 'Battery at 5 percent',
      items: [
        { t: 'Family', d: 'They feel your stress before you say a word.' },
        { t: 'Women', d: 'You pull back. Or you bring the chaos with you.' },
        { t: 'Friends', d: 'You cancel. Again and again.' },
        { t: 'You', d: 'Strong for everyone. But nobody is strong for you.' },
      ],
    },
    guide: {
      eyebrow: 'Your coach',
      title: 'This is Nalie.',
      text: 'Nalie is Kurdish. He knows what family means: loyalty, responsibility, and everyone looking to you. He turns chaos into structure. No motivational video. A plan, and someone who checks in.',
      chips: ['Clear steps', 'Check-in every 2 weeks', 'Speaks your language'],
      alt: 'Nalie, Reliable Man coach',
    },
    house: {
      eyebrow: 'The Reliable Man method',
      titleA: 'Your family is the roof.',
      titleB: 'You are the foundation.',
      aria: 'A house: the roof is the family, four pillars hold it up, and you are the foundation',
      roof: 'FAMILY',
      base: 'YOU',
      pillars: [
        { t: 'Structure', d: 'Everything out of your head. One plan. A routine that holds.' },
        { t: 'Money', d: 'You know where every euro goes. Give, keep, build.' },
        { t: 'Mind', d: 'Handle the pressure. Set boundaries. Without the guilt.' },
        { t: 'Presence', d: 'Calm. Clear. The man family and women can count on.' },
      ],
    },
    plan: {
      eyebrow: 'How it works',
      title: '3 steps. No guesswork.',
      items: [
        { t: 'Apply', d: '2 minutes. Honest answers.' },
        { t: 'Call with Nalie', d: 'Where are you? What comes first?' },
        { t: 'Build the structure', d: 'A call every 2 weeks. Clear steps in between.' },
      ],
    },
    compare: {
      eyebrow: 'One programme. Two ways in.',
      title: 'Same system. You choose how close.',
      aria: 'Brotherhood and Private compared',
      group: 'Brotherhood',
      groupSub: 'Group · monthly',
      vip: 'Private',
      vipSub: '1:1 · 3 months',
      rows: [
        '2 coaching calls a month with Nalie',
        'Clear tasks between calls',
        'Progress check-ins',
        'Accountability dashboard',
        'Brothers carrying the same weight',
        '1:1 calls, just you and Nalie',
        'A personal plan for your family situation',
      ],
      note: 'The form shows you instantly which way fits you.',
      cta: 'Find your way',
    },
    futures: {
      eyebrow: 'One year from now',
      title: 'Which man do you want to be?',
      noH: 'If nothing changes',
      yesH: 'As a Reliable Man',
      before: ['Everything in your head', 'Money disappears', 'Every day is survival', '"I am not enough"', 'Alone with all of it'],
      after: ['One clear plan', 'You know your numbers', 'A routine that holds', 'You know who you are', 'A coach and brothers by your side'],
      punch: 'Not for men looking for a shortcut.',
      punchStrong: 'For men who want to deliver.',
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What men ask before they apply.',
      items: [
        { q: 'What is the difference between the Brotherhood and Private?', a: 'Same system, same rhythm: 2 calls a month, tasks, check-ins, dashboard. Private is 1:1, built completely around you and your family, for 3 months. The Brotherhood is the same work in a group, monthly. The form shows you which one fits.' },
        { q: 'What does it cost?', a: 'Private: €3,000 to €5,000 for 3 months, depending on what your situation needs. Brotherhood: around €300 to €500 a month.' },
        { q: 'I barely have money. How am I supposed to pay for this?', a: 'That is exactly why the form asks honestly. Staying where you are costs you every month too. The Brotherhood is built so you can start now. And if it is not possible right now, say so. Nobody will push you.' },
        { q: 'How much time does it take?', a: '2 calls a month and a few clear tasks in between. The goal is to give you time back, not to add more weight.' },
        { q: 'Is this therapy?', a: 'No. This is coaching: structure, routine, steps, accountability. Not therapy, and not financial or legal advice.' },
        { q: 'Can I talk openly about my family?', a: 'Yes. What you tell Nalie stays with Nalie. In the group, you decide what you share.' },
        { q: 'Is it online?', a: 'Yes. All calls are online, so you can join from wherever you live.' },
      ],
    },
    applyBlock: {
      eyebrow: 'Apply',
      titleA: 'They already count on you.',
      titleB: 'Now build the structure.',
      points: ['2 minutes', 'Nalie reads every application himself', 'You see instantly which way fits'],
    },
    footer: 'Coaching. Not therapy, financial or legal advice. Results depend on your own effort.',
    form: {
      name: 'First name', namePh: 'Your first name',
      phone: 'WhatsApp', phonePh: '+49 151 ...',
      email: 'Email (optional)', emailPh: 'you@email.com',
      ageQ: 'How old are you?',
      q1: 'What is weighing on your shoulders?',
      q2: 'What is hardest right now?',
      q3: '3. In 90 days: how will you know you are the man everyone can count on? (optional)',
      q3Ph: 'Be honest, brother. Money, routine, family, a woman by your side...',
      q4: 'When do you want to start?',
      q5: 'Coaching is an investment in yourself. Where are you at?',
      q6: 'It only works if you deliver. Are you in?',
      ages: [
        { value: '18-24', label: '18 to 24' },
        { value: '25-34', label: '25 to 34' },
        { value: '35-45', label: '35 to 45' },
        { value: '45+', label: 'Over 45' },
      ],
      situations: [
        { value: 'firstborn', label: 'I am the eldest. Everyone relies on me' },
        { value: 'divorce', label: 'My parents split up and I stepped in' },
        { value: 'mother', label: 'My mum is struggling: money or health' },
        { value: 'provider', label: 'I provide for more people than just myself' },
        { value: 'other', label: 'Something else put the weight on me early' },
      ],
      struggles: [
        { value: 'money', label: 'Money. Nothing left at the end of the month' },
        { value: 'structure', label: 'Structure. No plan, every day is chaos' },
        { value: 'pressure', label: 'The pressure. I am tired and talk to nobody' },
        { value: 'self', label: 'Myself. I am not the man I could be' },
        { value: 'women', label: 'Women and relationships. I have nothing left to give' },
      ],
      start: [
        { value: 'now', label: 'Right now. I am done waiting' },
        { value: 'month', label: 'In the next 30 days' },
        { value: 'exploring', label: 'I am just looking around' },
      ],
      invest: [
        { value: 'private', label: 'I am ready to invest €3,000 to €5,000 in 3 months 1:1 with Nalie', hint: 'Reliable Man Private' },
        { value: 'group', label: 'I can invest around €300 to €500 a month, in a group', hint: 'Reliable Man Brotherhood' },
        { value: 'none', label: 'I cannot invest right now' },
      ],
      commit: [
        { value: 'yes', label: 'Yes. I will show up to every call and do the work' },
        { value: 'unsure', label: 'I want to, but I am not sure I can' },
      ],
      missing: 'Please still answer:',
      gapNames: ['Age', 'Question 1', 'Question 2', 'Question 4', 'Question 5', 'Question 6'],
      submit: 'Send my application',
      sending: 'Sending…',
      fine: '2 minutes. Nalie reads every application himself.',
      fitLabel: {
        private: 'Reliable Man Private (1:1)',
        group: 'Reliable Man Brotherhood (group)',
        later: 'Not ready to invest yet',
      },
      result: {
        private: { tag: 'You fit Private', h: '{name}, you are ready for Reliable Man Private.', p: '3 months 1:1 with Nalie. 2 calls a month, clear tasks in between and check-ins until the structure holds.' },
        group: { tag: 'You fit the Brotherhood', h: '{name}, your place is in the Brotherhood.', p: 'The same system: 2 calls a month with Nalie, tasks, dashboard. Together with brothers carrying the same weight.' },
        later: { tag: 'Application received', h: 'Respect for your honesty, {name}.', p: 'Admitting you need structure is the first step. When you are ready to invest, the Brotherhood is open.' },
      },
      brother: 'brother',
      waStepStrong: 'Last step:',
      waStep: 'Send Nalie your answers on WhatsApp. Everything is filled in, you just press send.',
      waButton: 'Send to Nalie on WhatsApp',
      noWa: 'Nalie will reach out to you. Keep your phone close.',
      msg: { intro: 'Hi Nalie, here is my application for Reliable Man.', name: 'Name', age: 'Age', situation: 'Situation', hardest: 'Hardest right now', goal: 'In 90 days I want', start: 'Start', invest: 'Investment', commit: 'Commitment', fits: 'Fits' },
    },
  },

  // ═══════════════════════════════════ DEUTSCH ═══════════════════════════════════
  de: {
    htmlLang: 'de',
    switchLabel: 'EN',
    switchHref: '/nalie',
    switchAria: 'This page in English',
    apply: 'Bewerben',
    hero: {
      eyebrow: 'Für den ältesten Sohn, der zu früh Mann werden musste',
      h1a: 'Die ganze Familie schaut auf dich.',
      h1b: 'Werde der Mann, der liefert.',
      lede: 'Geld. Respekt. Die richtige Frau. Eine starke Familie. Du willst alles. Reliable Man gibt dir die Struktur, um es zu tragen, ohne zu zerbrechen.',
      cta: 'Jetzt bewerben',
      coach: 'Coaching mit Nalie',
      coachSub: '1:1 oder in der Gruppe · Nur mit Bewerbung',
      loadTitle: 'Deine Last heute',
      load: ['Familie', 'Mama', 'Rechnungen', 'Deine Zukunft', 'Frauen'],
      structure: 'Deine Struktur',
      loadFoot: 'Viel Last. Kaum Struktur.',
      loadFootStrong: 'Das ändern wir.',
      loadAria: 'So fühlt es sich an: deine Last heute',
    },
    pains: {
      eyebrow: 'Kennst du das?',
      title: 'Keiner hat dich gefragt. Du hast einfach übernommen.',
      items: [
        'Wenn es brennt, rufen sie dich.',
        'Mama hat Sorgen. Du springst ein.',
        'Monatsende. Das Geld ist weg.',
        'Kein Plan. Jeder Tag ist Feuerwehr.',
        'Du redest mit niemandem darüber.',
        'Frauen, Freunde, Träume: alles später.',
      ],
      punch: 'Zwei davon treffen?',
      punchStrong: 'Dann ist das hier für dich, Bruder.',
    },
    worlds: {
      eyebrow: 'Zwei Welten',
      title: 'Zuhause zählt die Familie. Draußen zählt Leistung.',
      homeH: 'Zuhause',
      home: ['Familie zuerst', 'Respekt vor den Eltern', 'Zusammenhalt'],
      outH: 'Draußen',
      out: ['Tempo', 'Geld und Status', 'Ergebnisse'],
      you: 'Du stehst dazwischen.',
      youStrong: 'Keiner hat dir gezeigt, wie man beides trägt.',
    },
    wants: {
      eyebrow: 'Was du wirklich willst',
      titleA: 'Du willst alles.',
      titleB: 'Zu Recht.',
      sub: 'Kein Entweder-oder. Erfolg und Familie. Wohlstand und Loyalität.',
      items: [
        { t: 'Wohlstand', d: 'Eigenes Geld. Nicht nur für die Familie. Auch für dich.' },
        { t: 'Respekt', d: 'Wenn du redest, hören sie zu.' },
        { t: 'Anziehung', d: 'Ein Mann mit Plan und Ruhe zieht Frauen an.' },
        { t: 'Starke Familie', d: 'Mama muss sich keine Sorgen mehr machen.' },
        { t: 'Stolz', d: 'Du erkennst den Mann im Spiegel wieder.' },
        { t: 'Freiheit', d: 'Zeit für dich. Ohne schlechtes Gewissen.' },
      ],
    },
    pack: {
      eyebrow: 'Stell dir einen Rucksack vor',
      title: 'Gleiches Gewicht. Anderes Leben.',
      bad: 'Ohne Gurte',
      badText: 'Schief. Schmerz. Du hältst nicht lange durch.',
      good: 'Mit Gurten',
      goodText: 'Aufrecht. Stark. Du gehst weiter.',
      badAria: 'Mann mit Rucksack ohne Gurte, schief',
      goodAria: 'Mann mit Rucksack mit Gurten, aufrecht',
      punchA: 'Die Last ist nicht das Problem.',
      punchStrong: 'Dir fehlen die Gurte.',
      punchB: 'Reliable Man gibt dir die Gurte.',
    },
    battery: {
      eyebrow: 'Was es dich kostet',
      title: 'Du läufst seit Jahren auf 5%.',
      aria: 'Akku 5 Prozent',
      items: [
        { t: 'Familie', d: 'Sie spüren deinen Stress, bevor du redest.' },
        { t: 'Frauen', d: 'Du ziehst dich zurück. Oder bringst das Chaos mit.' },
        { t: 'Freunde', d: 'Du sagst ab. Immer wieder.' },
        { t: 'Du', d: 'Stark für alle. Aber keiner ist stark für dich.' },
      ],
    },
    guide: {
      eyebrow: 'Dein Coach',
      title: 'Das ist Nalie.',
      text: 'Nalie ist Kurde. Er weiß, was Familie bedeutet: Loyalität, Verantwortung, und dass alle auf dich schauen. Er macht aus Chaos Struktur. Kein Motivationsvideo. Ein Plan, und jemand, der nachfragt.',
      chips: ['Klare Schritte', 'Check alle 2 Wochen', 'Spricht deine Sprache'],
      alt: 'Nalie, Coach von Reliable Man',
    },
    house: {
      eyebrow: 'Die Reliable Man Methode',
      titleA: 'Deine Familie ist das Dach.',
      titleB: 'Du bist das Fundament.',
      aria: 'Ein Haus: das Dach ist die Familie, vier Säulen tragen es, das Fundament bist du',
      roof: 'FAMILIE',
      base: 'DU',
      pillars: [
        { t: 'Struktur', d: 'Alles raus aus dem Kopf. Ein Plan. Eine Routine, die hält.' },
        { t: 'Geld', d: 'Du weißt, wohin jeder Euro geht. Geben, behalten, aufbauen.' },
        { t: 'Kopf', d: 'Druck aushalten. Grenzen setzen. Ohne schlechtes Gewissen.' },
        { t: 'Auftreten', d: 'Ruhig. Klar. Der Mann, auf den Familie und Frauen zählen.' },
      ],
    },
    plan: {
      eyebrow: 'So läuft es',
      title: '3 Schritte. Kein Rätselraten.',
      items: [
        { t: 'Bewerben', d: '2 Minuten. Ehrliche Antworten.' },
        { t: 'Gespräch mit Nalie', d: 'Wo stehst du? Was zuerst?' },
        { t: 'Struktur bauen', d: 'Alle 2 Wochen ein Call. Dazwischen klare Schritte.' },
      ],
    },
    compare: {
      eyebrow: 'Ein Programm. Zwei Wege.',
      title: 'Gleiches System. Du wählst, wie nah.',
      aria: 'Brotherhood und Private im Vergleich',
      group: 'Brotherhood',
      groupSub: 'Gruppe · monatlich',
      vip: 'Private',
      vipSub: '1:1 · 3 Monate',
      rows: [
        '2 Coaching-Calls pro Monat mit Nalie',
        'Klare Aufgaben zwischen den Calls',
        'Fortschritts-Checks',
        'Accountability-Dashboard',
        'Brüder, die dieselbe Last tragen',
        'Calls 1:1, nur du und Nalie',
        'Persönlicher Plan für deine Familiensituation',
      ],
      note: 'Das Formular zeigt dir sofort, welcher Weg zu dir passt.',
      cta: 'Finde deinen Weg',
    },
    futures: {
      eyebrow: 'In einem Jahr',
      title: 'Welcher Mann willst du sein?',
      noH: 'Wenn sich nichts ändert',
      yesH: 'Als Reliable Man',
      before: ['Alles im Kopf', 'Geld verschwindet', 'Jeder Tag ist Überleben', '"Ich bin nicht genug"', 'Allein mit allem'],
      after: ['Ein klarer Plan', 'Du kennst deine Zahlen', 'Routine, die hält', 'Du weißt, wer du bist', 'Coach und Brüder an deiner Seite'],
      punch: 'Nicht für Männer, die eine Abkürzung suchen.',
      punchStrong: 'Für Männer, die liefern wollen.',
    },
    faq: {
      eyebrow: 'Fragen',
      title: 'Das fragen Männer vor der Bewerbung.',
      items: [
        { q: 'Was ist der Unterschied zwischen Brotherhood und Private?', a: 'Gleiches System, gleicher Rhythmus: 2 Calls im Monat, Aufgaben, Checks, Dashboard. Private ist 1:1, ganz auf dich und deine Familie zugeschnitten, 3 Monate lang. Die Brotherhood ist dasselbe in der Gruppe, monatlich. Das Formular zeigt dir, was passt.' },
        { q: 'Was kostet es?', a: 'Private: 3.000 bis 5.000 € für 3 Monate, je nachdem, was deine Situation braucht. Brotherhood: ca. 300 bis 500 € im Monat.' },
        { q: 'Ich habe kaum Geld. Wie soll ich das zahlen?', a: 'Genau deshalb fragt das Formular ehrlich nach. Dort stehen zu bleiben, wo du bist, kostet dich auch jeden Monat. Die Brotherhood ist dafür gebaut, dass du jetzt starten kannst. Und wenn es gerade nicht geht, sag es. Niemand drängt dich.' },
        { q: 'Wie viel Zeit brauche ich?', a: '2 Calls im Monat und ein paar klare Aufgaben dazwischen. Das Ziel ist, dir Zeit zurückzugeben, nicht noch mehr Last.' },
        { q: 'Ist das Therapie?', a: 'Nein. Das ist Coaching: Struktur, Routine, Schritte, Verantwortung. Keine Therapie und keine Finanz- oder Rechtsberatung.' },
        { q: 'Kann ich offen über meine Familie reden?', a: 'Ja. Was du Nalie erzählst, bleibt bei Nalie. In der Gruppe entscheidest du selbst, was du teilst.' },
        { q: 'Ist das online?', a: 'Ja. Alle Calls sind online. Du machst mit, egal wo du wohnst.' },
      ],
    },
    applyBlock: {
      eyebrow: 'Bewerbung',
      titleA: 'Sie zählen schon auf dich.',
      titleB: 'Jetzt bau die Struktur.',
      points: ['2 Minuten', 'Nalie liest jede Bewerbung selbst', 'Du siehst sofort, welcher Weg passt'],
    },
    footer: 'Coaching. Keine Therapie, keine Finanz- oder Rechtsberatung. Ergebnisse hängen von deinem Einsatz ab.',
    form: {
      name: 'Vorname', namePh: 'Dein Vorname',
      phone: 'WhatsApp', phonePh: '+49 151 ...',
      email: 'E-Mail (optional)', emailPh: 'du@email.de',
      ageQ: 'Wie alt bist du?',
      q1: 'Was lastet auf deinen Schultern?',
      q2: 'Was ist gerade am härtesten?',
      q3: '3. In 90 Tagen: Woran merkst du, dass du der Mann bist, auf den alle zählen können? (optional)',
      q3Ph: 'Ehrlich, Bruder. Geld, Routine, Familie, eine Frau an deiner Seite...',
      q4: 'Wann willst du starten?',
      q5: 'Coaching ist eine Investition in dich. Wo stehst du?',
      q6: 'Es funktioniert nur, wenn du lieferst. Bist du dabei?',
      ages: [
        { value: '18-24', label: '18 bis 24' },
        { value: '25-34', label: '25 bis 34' },
        { value: '35-45', label: '35 bis 45' },
        { value: '45+', label: 'Über 45' },
      ],
      situations: [
        { value: 'firstborn', label: 'Ich bin der Älteste. Alle verlassen sich auf mich' },
        { value: 'divorce', label: 'Meine Eltern haben sich getrennt und ich bin eingesprungen' },
        { value: 'mother', label: 'Meine Mutter hat Sorgen: Geld oder Gesundheit' },
        { value: 'provider', label: 'Ich versorge mehr Menschen als nur mich selbst' },
        { value: 'other', label: 'Etwas anderes hat mir früh die Last gegeben' },
      ],
      struggles: [
        { value: 'money', label: 'Geld. Am Monatsende ist nichts übrig' },
        { value: 'structure', label: 'Struktur. Kein Plan, jeder Tag ist Chaos' },
        { value: 'pressure', label: 'Der Druck. Ich bin müde und rede mit niemandem' },
        { value: 'self', label: 'Ich selbst. Ich bin nicht der Mann, der ich sein könnte' },
        { value: 'women', label: 'Frauen und Beziehungen. Ich habe nichts mehr übrig' },
      ],
      start: [
        { value: 'now', label: 'Sofort. Ich warte nicht mehr' },
        { value: 'month', label: 'In den nächsten 30 Tagen' },
        { value: 'exploring', label: 'Ich schaue mich nur um' },
      ],
      invest: [
        { value: 'private', label: 'Ich bin bereit, 3.000 bis 5.000 € in 3 Monate 1:1 mit Nalie zu investieren', hint: 'Reliable Man Private' },
        { value: 'group', label: 'Ich kann ca. 300 bis 500 € im Monat investieren, in der Gruppe', hint: 'Reliable Man Brotherhood' },
        { value: 'none', label: 'Ich kann gerade nicht investieren' },
      ],
      commit: [
        { value: 'yes', label: 'Ja. Ich komme zu jedem Call und mache die Aufgaben' },
        { value: 'unsure', label: 'Ich will, aber ich weiß nicht, ob ich es schaffe' },
      ],
      missing: 'Bitte noch beantworten:',
      gapNames: ['Alter', 'Frage 1', 'Frage 2', 'Frage 4', 'Frage 5', 'Frage 6'],
      submit: 'Bewerbung abschicken',
      sending: 'Wird gesendet…',
      fine: '2 Minuten. Nalie liest jede Bewerbung selbst.',
      fitLabel: {
        private: 'Reliable Man Private (1:1)',
        group: 'Reliable Man Brotherhood (Gruppe)',
        later: 'Noch nicht bereit zu investieren',
      },
      result: {
        private: { tag: 'Du passt zu Private', h: '{name}, du bist bereit für Reliable Man Private.', p: '3 Monate 1:1 mit Nalie. 2 Calls im Monat, klare Aufgaben dazwischen und Checks, bis die Struktur sitzt.' },
        group: { tag: 'Du passt zur Brotherhood', h: '{name}, dein Platz ist in der Brotherhood.', p: 'Das gleiche System: 2 Calls im Monat mit Nalie, Aufgaben, Dashboard. Zusammen mit Brüdern, die dieselbe Last tragen.' },
        later: { tag: 'Bewerbung erhalten', h: 'Respekt für deine Ehrlichkeit, {name}.', p: 'Zuzugeben, dass du Struktur brauchst, ist der erste Schritt. Wenn du bereit bist zu investieren, steht die Brotherhood offen.' },
      },
      brother: 'Bruder',
      waStepStrong: 'Letzter Schritt:',
      waStep: 'Schick Nalie deine Antworten auf WhatsApp. Alles ist schon ausgefüllt, du musst nur auf Senden drücken.',
      waButton: 'An Nalie auf WhatsApp senden',
      noWa: 'Nalie meldet sich bei dir. Halte dein Handy bereit.',
      msg: { intro: 'Hallo Nalie, hier ist meine Bewerbung für Reliable Man.', name: 'Name', age: 'Alter', situation: 'Situation', hardest: 'Am härtesten', goal: 'In 90 Tagen will ich', start: 'Start', invest: 'Investition', commit: 'Commitment', fits: 'Passt zu' },
    },
  },
}
