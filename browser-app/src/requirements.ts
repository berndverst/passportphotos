import { groups, type AgeGroup, type FramingRequirements, type PhotoFormat } from './geometry';

export type DocumentType = 'passport' | 'visa';
export type PhotoProfile = {
  format: PhotoFormat;
  dpi: number;
  framing: FramingRequirements;
  headLandmark: string;
  widthLandmarks?: string;
  background: string;
  quality: string;
  submission: string;
  ages: Record<AgeGroup, string>;
  ageNotes?: Record<AgeGroup, string>;
  sources: { name: string; url: string }[];
};
export type Country = {
  code: string;
  name: string;
  eu: boolean;
  profiles: Partial<Record<DocumentType, PhotoProfile>>;
};

const allAges = (min: number, max: number, target = (min + max) / 2): FramingRequirements => ({
  head: { adult: { min, max, target }, child: { min, max, target }, infant: { min, max, target } },
});
const ordinaryAges = { adult: 'Adult', child: 'Child', infant: 'Infant' };
const germanAges = { adult: 'Adult / over 10', child: 'Child 7–10', infant: 'Child 0–6' };
const source = (name: string, url: string) => ({ name, url });
const portrait = (framing: FramingRequirements, sources: PhotoProfile['sources']): PhotoProfile => ({
  format: 'de', dpi: 300, framing,
  headLandmark: 'anatomical top of head, excluding hair',
  background: 'Plain light background with no shadows and good contrast to the face and hair.',
  quality: 'Use a recent, sharp color photo, even lighting, frontal pose, neutral expression, mouth closed and visible open eyes. No retouching, other people or objects. Check the official rules for glasses, head coverings and any child exceptions.',
  submission: 'Check the receiving authority’s current submission method and photo-paper requirements. This tool does not validate online uploads or certify acceptance.',
  ages: ordinaryAges, sources,
});
const maximumHead: FramingRequirements = {
  head: {
    adult: { max: 36, target: 30 }, child: { max: 36, target: 30 }, infant: { max: 36, target: 30 },
  },
  width: { min: 8, target: 10 },
};
const germany: PhotoProfile = {
  ...portrait({ head: groups }, [
    source('German official photo examples', 'https://www.germany.info/resource/blob/906790/6e3eee9fd4d86e16aaefe0e92d809332/dd-sample-photos-data.pdf'),
  ]),
  headLandmark: 'natural crown with normal hair, not stray strands or headwear',
  ages: germanAges,
  ageNotes: { adult: groups.adult.note, child: groups.child.note, infant: groups.infant.note },
  quality: 'Use a sharp, evenly lit, front-facing color photo with natural skin tones. Check the age-specific eye visibility and expression rules in the official examples. No other person or object may appear.',
  submission: 'In Germany, domestic passport applications generally require secure digital capture; home-printed or self-generated photos may not be accepted. Consular passport and visa submission rules can differ.',
};
const unitedStates: PhotoProfile = {
  ...portrait(allAges(25.4, 34.925, 30), [
    source('U.S. passport photos', 'https://travel.state.gov/en/passports/apply/help/photos.html'),
    source('U.S. visa photos', 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html'),
  ]),
  format: 'us',
  background: 'Plain white or off-white background with no shadows.',
  ages: { adult: 'Adult', child: 'Child (age 1+)', infant: 'Infant (under 1)' },
  quality: 'Use a color photo taken within six months, even lighting, natural skin tones, a sharp frontal face and neutral expression. No glasses except documented medical necessity; headwear only for qualifying religious or medical reasons. No filters, retouching or other person. Infants under one may have partly or fully closed eyes and minor head tilt.',
  submission: 'U.S. passport and visa print applications require photo-quality paper. Online passport renewal and visa uploads have separate file rules; this printable JPG is not a validated online-submission file.',
};
const china: PhotoProfile = {
  ...portrait({
    ...allAges(28, 33, 30.5),
    width: { min: 15, max: 22, target: 18.5 },
    topGap: { min: 3, max: 5, target: 4 },
    bottomGap: { min: 7, target: 13.5 },
  }, [
    source('Chinese passport photo rules (Chicago consulate)', 'https://chicago.china-consulate.gov.cn/lsfw/zj/hzlxz/202605/t20260501_11903971.htm'),
    source('Chinese visa photo rules', 'https://www.visaforchina.cn/SYD3_EN/qianzhengyewu/jichuzhishi/changjianwenti/355135188537315328.html'),
  ]),
  format: 'cn', widthLandmarks: 'left and right edges of the head as shown in the official diagram',
  background: 'Plain white background without shadows.',
  quality: 'Use a sharp color photo taken within six months, neutral expression, closed mouth and open visible eyes. Head height is 28–33 mm and width 15–22 mm. No tinted or thick-rimmed glasses, glare or obscured face. No unverified infant exceptions are applied.',
  submission: 'Mainland China passport and visa photos share the 33 × 48 mm size and head dimensions, but their submission rules differ. Passport applications may require a certified digital-photo receipt; this app cannot issue one. Visa applications require professional glossy photo paper; check the visa center’s current upload and print instructions.',
};

export const COUNTRIES: readonly Country[] = [
  {
    code: 'at', name: 'Austria', eu: true,
    profiles: { passport: {
      ...portrait(maximumHead, [source('Austrian Ministry of the Interior', 'https://www.bmi.gv.at/607/passbild_kriterien.html')]),
      widthLandmarks: 'centers of the left and right pupils',
      quality: 'Head should occupy about two thirds of the photo, no taller than 36 mm; pupil spacing must be at least 8 mm (10 mm ideal). Eyes must be open, including children. Use glossy, smooth photo paper. Tall hairstyles may extend outside the frame.',
    } },
  },
  {
    code: 'be', name: 'Belgium', eu: true,
    profiles: { passport: {
      ...portrait(allAges(31, 36), [source('Belgian official photo specifications', 'https://diplomatie.belgium.be/sites/default/files/downloads/exigences_photos.pdf')]),
      dpi: 400,
      quality: 'Use a recent color photo on high-quality smooth photo paper, at least 400 DPI. Eyes must remain visible. Children under six have pose and expression exceptions, not a different head-size range.',
    } },
  },
  {
    code: 'cn', name: 'China (mainland)', eu: false,
    profiles: { passport: china, visa: china },
  },
  {
    code: 'hr', name: 'Croatia', eu: true,
    profiles: { visa: {
      ...portrait(maximumHead, [source('Croatian Ministry of Foreign and European Affairs', 'https://mvep.gov.hr/consular-information-151075/visas-151076/when-is-visa-request-admissible/180329')]),
      widthLandmarks: 'centers of the left and right pupils',
      quality: 'Head should occupy about two thirds of the photo, no taller than 36 mm; pupil spacing must be at least 8 mm (10 mm ideal). Use high-quality glossy smooth photo paper. Children must be alone with their face fully visible and eyes open.',
    } },
  },
  {
    code: 'dk', name: 'Denmark', eu: true,
    profiles: { passport: {
      ...portrait(allAges(30, 36), [source('Danish Police photo specifications', 'https://politi.dk/-/media/mediefiler/landsdaekkende-dokumenter/lov-og-information/pas/krav-til-pasfoto/krav-til-pasbilleder.pdf')]),
      headLandmark: 'top of the hair',
      background: 'Uniform light background, for example light blue or light grey, with good contrast to light hair.',
      quality: 'All photo rules apply to children too: frontal face, visible open eyes and closed mouth. Show the face and upper shoulders. No reflections, tinted lenses or frames covering the eyes.',
    } },
  },
  {
    code: 'fr', name: 'France', eu: true,
    profiles: { passport: {
      ...portrait(allAges(32, 36), [source('French public-service photo requirements', 'https://www.service-public.gouv.fr/particuliers/vosdroits/F10619')]),
      background: 'Plain light blue or light grey background. White backgrounds are forbidden.',
      quality: 'Use a recent sharp color photo, uncovered head, neutral expression, closed mouth, open visible eyes and exposed ears. Measure the anatomical crown, excluding hair. Glasses must not hide the eyes or cause reflections.',
    } },
  },
  { code: 'de', name: 'Germany', eu: true, profiles: { passport: germany, visa: germany } },
  {
    code: 'gr', name: 'Greece', eu: true,
    profiles: { passport: {
      ...portrait(allAges(30, 36), [source('Greek passport authority', 'https://passport.gov.gr/en/diadikasia-ekdosis/documents/specificationphoto.html')]),
      format: 'gr', dpi: 1200,
      headLandmark: 'top of the forehead, not the crown or hair',
      background: 'Uniform light background, preferably grey RGB (190, 190, 190), with a tolerance of 10 per channel.',
      quality: 'Chin to top of forehead must occupy 50–60% of the photo; base of shoulders to top of hair must occupy 70–75% (check this visually). Neutral expression, closed mouth and open eyes. Printed digital-camera photos need at least 1200 DPI and analog photographic paper, not household inkjet or laser printing.',
      submission: 'Domestic Greek passport applications require the government myPhoto service. This tool cannot submit to myPhoto. Prints may be supplied for consular applications abroad; check whether the consulate instead captures or requires a digital photo.',
    } },
  },
  {
    code: 'ie', name: 'Ireland', eu: true,
    profiles: { visa: {
      ...portrait(allAges(31.5, 36), [source('Irish Immigration visa photo rules', 'https://www.irishimmigration.ie/photograph-rules-for-visa-applications/')]),
      background: 'Plain white or light grey background.',
      quality: 'The selected 35 × 45 mm size is within the permitted 35–38 mm width and 45–50 mm height. Face must occupy 70–80%. Supply two identical color photos under six months old, with neutral expression, open eyes and closed mouth.',
    } },
  },
  {
    code: 'lv', name: 'Latvia', eu: true,
    profiles: { visa: {
      ...portrait(allAges(31.5, 36), [source('Latvian official visa photo requirements', 'https://epak.pmlp.gov.lv/NVIS.EService001.WebSite/Help/BiometricRequirements/Mat_ENG.pdf')]),
      quality: 'Use a recent color 35 × 45 mm photo; the face must occupy 70–80% of its height. Check the official examples for framing, expression and background. Latvia’s passport print rules are different and are not offered here.',
    } },
  },
  {
    code: 'nl', name: 'Netherlands', eu: true,
    profiles: { passport: {
      ...portrait({
        ...allAges(26, 30),
        head: { adult: { min: 26, max: 30, target: 28 }, child: { min: 19, max: 30, target: 24.5 }, infant: { min: 19, max: 30, target: 24.5 } },
        width: { min: 16, max: 20, target: 18 },
      }, [source('Dutch government photo requirements', 'https://www.rijksoverheid.nl/themas/migratie-en-reizen/paspoort-en-identiteitskaart/eisen-pasfoto-paspoort-id-kaart')]),
      dpi: 400, widthLandmarks: 'left and right ear roots, not the outer edges of the ears',
      ages: { adult: 'Adult / age 11+', child: 'Child 6–10', infant: 'Child under 6' },
      background: 'Plain light grey, light blue or white background with good contrast.',
      quality: 'Face width from ear root to ear root must be 16–20 mm. Use at least 400 DPI. Children under six have pose and expression exceptions, but eyes must still be open. No editing, shadows or visible support.',
    } },
  },
  { code: 'us', name: 'United States', eu: false, profiles: { passport: unitedStates, visa: unitedStates } },
];

export function getCountry(code: string): Country {
  const country = COUNTRIES.find((entry) => entry.code === code);
  if (!country) throw new Error(`No verified photo requirements for country: ${code}`);
  return country;
}

export function getProfile(country: Country, document: DocumentType): PhotoProfile {
  const profile = country.profiles[document];
  if (!profile) throw new Error(`No verified ${document} photo requirements for ${country.name}.`);
  return profile;
}

export function rangeText(range: { min?: number; max?: number }): string {
  if (range.min !== undefined && range.max !== undefined) return `${range.min}–${range.max} mm`;
  return range.min !== undefined ? `at least ${range.min} mm` : `at most ${range.max} mm`;
}
