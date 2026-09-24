/**
 * Every threshold, formula and claim the analytics make points at one of
 * these. The UI can render them as tappable sources, and `docs/algorithms.md`
 * lists what each one supports. Entries retrieved from PubMed carry a PMID.
 */
export interface Citation {
  readonly authors: string;
  readonly year: number;
  readonly title: string;
  readonly journal: string;
  readonly doi?: string;
  readonly pmid?: string;
  readonly url?: string;
}

/**
 * How much weight a finding can bear.
 * - A: consistent evidence from large cohorts, randomized trials or meta-analyses.
 * - B: controlled studies with small samples or mixed results, or device-specific validity.
 * - C: physiologically sound, but thresholds or combinations need validating on the user.
 */
export type EvidenceGrade = 'A' | 'B' | 'C';

export const CITATIONS = {
  coyle1984: {
    authors: 'Coyle EF, Martin WH, Sinacore DR, et al.',
    year: 1984,
    title: 'Time course of loss of adaptations after stopping prolonged intense endurance training',
    journal: 'J Appl Physiol 57:1857–64',
    doi: '10.1152/jappl.1984.57.6.1857',
    pmid: '6511559',
  },
  coyle1986: {
    authors: 'Coyle EF, Hemmert MK, Coggan AR',
    year: 1986,
    title: 'Effects of detraining on cardiovascular responses to exercise: role of blood volume',
    journal: 'J Appl Physiol 60:95–99',
    doi: '10.1152/jappl.1986.60.1.95',
  },
  convertino1991: {
    authors: 'Convertino VA',
    year: 1991,
    title: 'Blood volume: its adaptation to endurance training',
    journal: 'Med Sci Sports Exerc 23:1338–48',
    pmid: '1798375',
  },
  kreitzman1992: {
    authors: 'Kreitzman SN, Coxon AY, Szaz KF',
    year: 1992,
    title:
      'Glycogen storage: illusions of easy weight loss, excessive weight regain, and distortions in estimates of body composition',
    journal: 'Am J Clin Nutr 56:292S–293S',
    doi: '10.1093/ajcn/56.1.292S',
  },
  damas2016: {
    authors: 'Damas F, Phillips SM, Lixandrão ME, et al.',
    year: 2016,
    title:
      'Early resistance training-induced increases in muscle cross-sectional area are concomitant with edema-induced muscle swelling',
    journal: 'Eur J Appl Physiol 116:49–56',
    doi: '10.1007/s00421-015-3243-4',
  },
  hall2011: {
    authors: 'Hall KD, Sacks G, Chandramohan D, et al.',
    year: 2011,
    title: 'Quantification of the effect of energy imbalance on bodyweight',
    journal: 'Lancet 378:826–37',
    doi: '10.1016/S0140-6736(11)60812-X',
  },
  demura2015: {
    authors: 'Demura S, Sato S',
    year: 2015,
    title:
      'Comparisons of accuracy of estimating percent body fat by four bioelectrical impedance devices',
    journal: 'J Sports Med Phys Fitness 55:68–75',
    pmid: '25642685',
  },
  plews2012: {
    authors: 'Plews DJ, Laursen PB, Kilding AE, Buchheit M',
    year: 2012,
    title:
      'Heart rate variability in elite triathletes, is variation in variability the key to effective training?',
    journal: 'Eur J Appl Physiol 112:3729–41',
    doi: '10.1007/s00421-012-2354-4',
  },
  plews2013: {
    authors: 'Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M',
    year: 2013,
    title: 'Training adaptation and heart rate variability in elite endurance athletes',
    journal: 'Sports Med 43:773–81',
    doi: '10.1007/s40279-013-0071-8',
  },
  plews2014: {
    authors: 'Plews DJ, Laursen PB, Le Meur Y, et al.',
    year: 2014,
    title:
      'Monitoring training with heart rate-variability: how much compliance is needed for valid assessment?',
    journal: 'Int J Sports Physiol Perform 9:783–90',
    doi: '10.1123/ijspp.2013-0455',
    pmid: '24334285',
  },
  buchheit2014: {
    authors: 'Buchheit M',
    year: 2014,
    title: 'Monitoring training status with HR measures: do all roads lead to Rome?',
    journal: 'Front Physiol 5:73',
    doi: '10.3389/fphys.2014.00073',
  },
  stanley2013: {
    authors: 'Stanley J, Peake JM, Buchheit M',
    year: 2013,
    title:
      'Cardiac parasympathetic reactivation following exercise: implications for training prescription',
    journal: 'Sports Med 43:1259–77',
    doi: '10.1007/s40279-013-0083-4',
    pmid: '23912805',
  },
  barnett2005: {
    authors: 'Barnett AG, van der Pols JC, Dobson AJ',
    year: 2005,
    title: 'Regression to the mean: what it is and how to deal with it',
    journal: 'Int J Epidemiol 34:215–20',
    doi: '10.1093/ije/dyh299',
    pmid: '15333621',
  },
  altini2021: {
    authors: 'Altini M, Plews D',
    year: 2021,
    title:
      'What is behind changes in resting heart rate and heart rate variability? A large-scale analysis of longitudinal measurements acquired in free-living',
    journal: 'Sensors 21:7932',
    doi: '10.3390/s21237932',
  },
  kiviniemi2007: {
    authors: 'Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP',
    year: 2007,
    title: 'Endurance training guided individually by daily heart rate variability measurements',
    journal: 'Eur J Appl Physiol 101:743–51',
    doi: '10.1007/s00421-007-0552-2',
    pmid: '17849143',
  },
  vesterinen2016: {
    authors: 'Vesterinen V, Nummela A, Heikura I, et al.',
    year: 2016,
    title: 'Individual endurance training prescription with heart rate variability',
    journal: 'Med Sci Sports Exerc 48:1347–54',
    doi: '10.1249/MSS.0000000000000910',
    pmid: '26909534',
  },
  javaloyes2019: {
    authors: 'Javaloyes A, Sarabia JM, Lamberts RP, Moya-Ramon M',
    year: 2019,
    title: 'Training prescription guided by heart-rate variability in cycling',
    journal: 'Int J Sports Physiol Perform 14:23–32',
    doi: '10.1123/ijspp.2018-0122',
  },
  duking2021: {
    authors: 'Düking P, Zinner C, Trabelsi K, et al.',
    year: 2021,
    title:
      'Monitoring and adapting endurance training on the basis of heart rate variability monitored by wearable technologies: a systematic review with meta-analysis',
    journal: 'J Sci Med Sport 24:1180–92',
    doi: '10.1016/j.jsams.2021.04.012',
  },
  morton1990: {
    authors: 'Morton RH, Fitz-Clarke JR, Banister EW',
    year: 1990,
    title: 'Modeling human performance in running',
    journal: 'J Appl Physiol 69:1171–7',
    doi: '10.1152/jappl.1990.69.3.1171',
  },
  hellard2006: {
    authors: 'Hellard P, Avalos M, Lacoste L, et al.',
    year: 2006,
    title: 'Assessing the limitations of the Banister model in monitoring training',
    journal: 'J Sports Sci 24:509–20',
    doi: '10.1080/02640410500244697',
  },
  foster1998: {
    authors: 'Foster C',
    year: 1998,
    title: 'Monitoring training in athletes with reference to overtraining syndrome',
    journal: 'Med Sci Sports Exerc 30:1164–8',
    doi: '10.1097/00005768-199807000-00023',
    pmid: '9662690',
  },
  foster2001: {
    authors: 'Foster C, Florhaug JA, Franklin J, et al.',
    year: 2001,
    title: 'A new approach to monitoring exercise training',
    journal: 'J Strength Cond Res 15:109–15',
    pmid: '11708692',
  },
  impellizzeri2020: {
    authors: 'Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ',
    year: 2020,
    title: 'Acute:chronic workload ratio: conceptual issues and fundamental pitfalls',
    journal: 'Int J Sports Physiol Perform 15:907–913',
    doi: '10.1123/ijspp.2019-0864',
  },
  meeusen2013: {
    authors: 'Meeusen R, Duclos M, Foster C, et al.',
    year: 2013,
    title:
      'Prevention, diagnosis, and treatment of the overtraining syndrome: joint consensus statement of the ECSS and ACSM',
    journal: 'Med Sci Sports Exerc 45:186–205',
    doi: '10.1249/MSS.0b013e318279a10a',
  },
  mishra2020: {
    authors: 'Mishra T, Wang M, Metwally AA, et al.',
    year: 2020,
    title: 'Pre-symptomatic detection of COVID-19 from smartwatch data',
    journal: 'Nat Biomed Eng 4:1208–20',
    doi: '10.1038/s41551-020-00640-6',
    pmid: '33208926',
  },
  natarajan2020: {
    authors: 'Natarajan A, Su HW, Heneghan C',
    year: 2020,
    title:
      'Assessment of physiological signs associated with COVID-19 measured using wearable devices',
    journal: 'NPJ Digit Med 3:156',
    doi: '10.1038/s41746-020-00363-7',
  },
  mason2022: {
    authors: 'Mason AE, Hecht FM, Davis SK, et al.',
    year: 2022,
    title:
      'Detection of COVID-19 using multimodal data from a wearable device: results from the first TemPredict Study',
    journal: 'Sci Rep 12:3463',
    doi: '10.1038/s41598-022-07314-0',
  },
  kodama2009: {
    authors: 'Kodama S, Saito K, Tanaka S, et al.',
    year: 2009,
    title:
      'Cardiorespiratory fitness as a quantitative predictor of all-cause mortality and cardiovascular events in healthy men and women: a meta-analysis',
    journal: 'JAMA 301:2024–35',
    doi: '10.1001/jama.2009.681',
  },
  caserman2024: {
    authors: 'Caserman P, Yum S, Göbel S, Reif A, Matura S',
    year: 2024,
    title:
      'Assessing the accuracy of smartwatch-based estimation of maximum oxygen uptake using the Apple Watch Series 7',
    journal: 'JMIR Biomed Eng 9:e59459',
    doi: '10.2196/59459',
  },
  cole1999: {
    authors: 'Cole CR, Blackstone EH, Pashkow FJ, Snader CE, Lauer MS',
    year: 1999,
    title: 'Heart-rate recovery immediately after exercise as a predictor of mortality',
    journal: 'N Engl J Med 341:1351–7',
    doi: '10.1056/NEJM199910283411804',
  },
  paluch2022: {
    authors: 'Paluch AE, Bajpai S, Bassett DR, et al.',
    year: 2022,
    title: 'Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts',
    journal: 'Lancet Public Health 7:e219–e228',
    doi: '10.1016/S2468-2667(21)00302-9',
  },
  watson2015: {
    authors: 'Watson NF, Badr MS, Belenky G, et al.',
    year: 2015,
    title:
      'Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and SRS',
    journal: 'Sleep 38:843–4',
    doi: '10.5665/sleep.4716',
  },
  phillips2017: {
    authors: 'Phillips AJK, Clerx WM, O’Brien CS, et al.',
    year: 2017,
    title:
      'Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing',
    journal: 'Sci Rep 7:3216',
    doi: '10.1038/s41598-017-03171-4',
    pmid: '28607474',
  },
  windred2024: {
    authors: 'Windred DP, Burns AC, Lane JM, et al.',
    year: 2024,
    title:
      'Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study',
    journal: 'Sleep 47:zsad253',
    doi: '10.1093/sleep/zsad253',
  },
  hopkins2000: {
    authors: 'Hopkins WG',
    year: 2000,
    title: 'Measures of reliability in sports medicine and science',
    journal: 'Sports Med 30:1–15',
    doi: '10.2165/00007256-200030010-00001',
  },
  bull2020: {
    authors: 'Bull FC, Al-Ansari SS, Biddle S, et al.',
    year: 2020,
    title: 'World Health Organization 2020 guidelines on physical activity and sedentary behaviour',
    journal: 'Br J Sports Med 54:1451–62',
    doi: '10.1136/bjsports-2020-102955',
    pmid: '33239350',
  },
  garber2011: {
    authors: 'Garber CE, Blissmer B, Deschenes MR, et al.',
    year: 2011,
    title:
      'ACSM position stand. Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults',
    journal: 'Med Sci Sports Exerc 43:1334–59',
    doi: '10.1249/MSS.0b013e318213fefb',
    pmid: '21694556',
  },
  tanaka2001: {
    authors: 'Tanaka H, Monahan KD, Seals DR',
    year: 2001,
    title: 'Age-predicted maximal heart rate revisited',
    journal: 'J Am Coll Cardiol 37:153–6',
    doi: '10.1016/s0735-1097(00)01054-8',
    pmid: '11153730',
  },
  bosquet2007: {
    authors: 'Bosquet L, Montpetit J, Arvisais D, Mujika I',
    year: 2007,
    title: 'Effects of tapering on performance: a meta-analysis',
    journal: 'Med Sci Sports Exerc 39:1358–65',
    doi: '10.1249/mss.0b013e31806010e0',
    pmid: '17762369',
  },
  hickson1985: {
    authors: 'Hickson RC, Foster C, Pollock ML, Galassi TM, Rich S',
    year: 1985,
    title: 'Reduced training intensities and loss of aerobic power, endurance, and cardiac growth',
    journal: 'J Appl Physiol 58:492–9',
    doi: '10.1152/jappl.1985.58.2.492',
    pmid: '3156841',
  },
  spiering2021: {
    authors: 'Spiering BA, Mujika I, Sharp MA, Foulis SA',
    year: 2021,
    title:
      'Maintaining physical performance: the minimal dose of exercise needed to preserve endurance and strength over time',
    journal: 'J Strength Cond Res 35:1449–58',
    doi: '10.1519/JSC.0000000000003964',
    pmid: '33629972',
  },
  nielsen2014: {
    authors: 'Nielsen RØ, Parner ET, Nohr EA, et al.',
    year: 2014,
    title: 'Excessive progression in weekly running distance and risk of running-related injuries',
    journal: 'J Orthop Sports Phys Ther 44:739–47',
    doi: '10.2519/jospt.2014.5164',
    pmid: '25155475',
  },
  buist2008: {
    authors: 'Buist I, Bredeweg SW, van Mechelen W, et al.',
    year: 2008,
    title:
      'No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial',
    journal: 'Am J Sports Med 36:33–9',
    doi: '10.1177/0363546507307505',
    pmid: '17940147',
  },
  schoenfeld2017: {
    authors: 'Schoenfeld BJ, Ogborn D, Krieger JW',
    year: 2017,
    title:
      'Dose-response relationship between weekly resistance training volume and increases in muscle mass',
    journal: 'J Sports Sci 35:1073–82',
    doi: '10.1080/02640414.2016.1210197',
    pmid: '27433992',
  },
  montero2017: {
    authors: 'Montero D, Lundby C',
    year: 2017,
    title:
      "Refuting the myth of non-response to exercise training: 'non-responders' do respond to higher dose of training",
    journal: 'J Physiol 595:3377–87',
    doi: '10.1113/JP273480',
    pmid: '28133739',
  },
  oliveira2024: {
    authors: 'Silva Oliveira P, Boppre G, Fonseca H',
    year: 2024,
    title:
      "Comparison of polarized versus other types of endurance training intensity distribution on athletes' endurance performance: a systematic review with meta-analysis",
    journal: 'Sports Med 54:2071–95',
    doi: '10.1007/s40279-024-02034-z',
    pmid: '38717713',
  },
  helgerud2007: {
    authors: 'Helgerud J, Høydal K, Wang E, et al.',
    year: 2007,
    title: 'Aerobic high-intensity intervals improve VO2max more than moderate training',
    journal: 'Med Sci Sports Exerc 39:665–71',
    doi: '10.1249/mss.0b013e3180304570',
    pmid: '17414804',
  },
  garthe2011: {
    authors: 'Garthe I, Raastad T, Refsnes PE, Koivisto A, Sundgot-Borgen J',
    year: 2011,
    title:
      'Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes',
    journal: 'Int J Sport Nutr Exerc Metab 21:97–104',
    doi: '10.1123/ijsnem.21.2.97',
    pmid: '21558571',
  },
  morton2018: {
    authors: 'Morton RW, Murphy KT, McKellar SR, et al.',
    year: 2018,
    title:
      'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength',
    journal: 'Br J Sports Med 52:376–84',
    doi: '10.1136/bjsports-2017-097608',
    pmid: '28698222',
  },
  heikkinen2003: {
    authors: 'Heikkinen T, Järvinen A',
    year: 2003,
    title: 'The common cold',
    journal: 'Lancet 361:51–9',
    doi: '10.1016/S0140-6736(03)12162-9',
    pmid: '12517470',
  },
  shcherbina2017: {
    authors: 'Shcherbina A, Mattsson CM, Waggott D, et al.',
    year: 2017,
    title:
      'Accuracy in wrist-worn, sensor-based measurements of heart rate and energy expenditure in a diverse cohort',
    journal: 'J Pers Med 7:3',
    doi: '10.3390/jpm7020003',
    pmid: '28538708',
  },
  apple2024exercise: {
    authors: 'Apple',
    year: 2024,
    title: 'Get the most accurate measurements using your Apple Watch',
    journal: 'Apple Support',
    url: 'https://support.apple.com/en-us/105002',
  },
  sen1968: {
    authors: 'Sen PK',
    year: 1968,
    title: "Estimates of the regression coefficient based on Kendall's tau",
    journal: 'J Am Stat Assoc 63:1379–89',
    doi: '10.1080/01621459.1968.10480934',
  },
  kalman1960: {
    authors: 'Kalman RE',
    year: 1960,
    title: 'A new approach to linear filtering and prediction problems',
    journal: 'J Basic Eng 82:35–45',
    doi: '10.1115/1.3662552',
  },
  rauch1965: {
    authors: 'Rauch HE, Tung F, Striebel CT',
    year: 1965,
    title: 'Maximum likelihood estimates of linear dynamic systems',
    journal: 'AIAA J 3:1445–50',
    doi: '10.2514/3.3166',
  },
  // ── Goals and body composition (verified on PubMed 2026-09-24) ─────────────
  nedeltcheva2010: {
    authors: 'Nedeltcheva AV, Kilkus JM, Imperial J, Schoeller DA, Penev PD',
    year: 2010,
    title: 'Insufficient sleep undermines dietary efforts to reduce adiposity',
    journal: 'Ann Intern Med 153:435–41',
    doi: '10.7326/0003-4819-153-7-201010050-00006',
    pmid: '20921542',
  },
  donnelly2009: {
    authors: 'Donnelly JE, Blair SN, Jakicic JM, Manore MM, Rankin JW, Smith BK',
    year: 2009,
    title:
      'American College of Sports Medicine Position Stand. Appropriate physical activity intervention strategies for weight loss and prevention of weight regain for adults',
    journal: 'Med Sci Sports Exerc 41:459–71',
    doi: '10.1249/MSS.0b013e3181949333',
    pmid: '19127177',
  },
  ross2020: {
    authors: 'Ross R, Neeland IJ, Yamashita S, et al.',
    year: 2020,
    title:
      'Waist circumference as a vital sign in clinical practice: a Consensus Statement from the IAS and ICCR Working Group on Visceral Obesity',
    journal: 'Nat Rev Endocrinol 16:177–89',
    doi: '10.1038/s41574-019-0310-7',
    pmid: '32020062',
  },
  ashwell2012: {
    authors: 'Ashwell M, Gunn P, Gibson S',
    year: 2012,
    title:
      'Waist-to-height ratio is a better screening tool than waist circumference and BMI for adult cardiometabolic risk factors: systematic review and meta-analysis',
    journal: 'Obes Rev 13:275–86',
    doi: '10.1111/j.1467-789X.2011.00952.x',
    pmid: '22106927',
  },
  schoenfeld2016: {
    authors: 'Schoenfeld BJ, Ogborn D, Krieger JW',
    year: 2016,
    title:
      'Effects of resistance training frequency on measures of muscle hypertrophy: a systematic review and meta-analysis',
    journal: 'Sports Med 46:1689–97',
    doi: '10.1007/s40279-016-0543-8',
    pmid: '27102172',
  },
  longland2016: {
    authors: 'Longland TM, Oikawa SY, Mitchell CJ, Devries MC, Phillips SM',
    year: 2016,
    title:
      'Higher compared with lower dietary protein during an energy deficit combined with intense exercise promotes greater lean mass gain and fat mass loss: a randomized trial',
    journal: 'Am J Clin Nutr 103:738–46',
    doi: '10.3945/ajcn.115.119339',
    pmid: '26817506',
  },
  villareal2017: {
    authors: 'Villareal DT, Aguirre L, Gurney AB, et al.',
    year: 2017,
    title: 'Aerobic or resistance exercise, or both, in dieting obese older adults',
    journal: 'N Engl J Med 376:1943–55',
    doi: '10.1056/NEJMoa1616338',
    pmid: '28514618',
  },
  mountjoy2018: {
    authors: 'Mountjoy M, Sundgot-Borgen JK, Burke LM, et al.',
    year: 2018,
    title: 'IOC consensus statement on relative energy deficiency in sport (RED-S): 2018 update',
    journal: 'Br J Sports Med 52:687–97',
    doi: '10.1136/bjsports-2018-099193',
    pmid: '29773536',
  },
  acsm2009: {
    authors: 'ACSM (American College of Sports Medicine)',
    year: 2009,
    title:
      'American College of Sports Medicine position stand. Progression models in resistance training for healthy adults',
    journal: 'Med Sci Sports Exerc 41:687–708',
    doi: '10.1249/MSS.0b013e3181915670',
    pmid: '19204579',
  },
  reed2014: {
    authors: 'Reed JL, Pipe AL',
    year: 2014,
    title: 'The talk test: a useful tool for prescribing and monitoring exercise intensity',
    journal: 'Curr Opin Cardiol 29:475–80',
    doi: '10.1097/HCO.0000000000000097',
    pmid: '25010379',
  },
  refalo2023: {
    authors: 'Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ',
    year: 2023,
    title:
      'Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis',
    journal: 'Sports Med 53:649–65',
    doi: '10.1007/s40279-022-01784-y',
    pmid: '36334240',
  },
  iraki2019: {
    authors: 'Iraki J, Fitschen P, Espinar S, Helms E',
    year: 2019,
    title: 'Nutrition recommendations for bodybuilders in the off-season: a narrative review',
    journal: 'Sports (Basel) 7:154',
    doi: '10.3390/sports7070154',
    pmid: '31247944',
  },
  helms2014: {
    authors: 'Helms ER, Aragon AA, Fitschen PJ',
    year: 2014,
    title:
      'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation',
    journal: 'J Int Soc Sports Nutr 11:20',
    doi: '10.1186/1550-2783-11-20',
    pmid: '24864135',
  },
} as const satisfies Record<string, Citation>;

export type CitationId = keyof typeof CITATIONS;

export function citationUrl(id: CitationId): string {
  const c: Citation = CITATIONS[id];
  if (c.doi) return `https://doi.org/${c.doi}`;
  if (c.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`;
  return c.url ?? '';
}
