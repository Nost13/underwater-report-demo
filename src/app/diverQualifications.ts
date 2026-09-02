export interface DiverQualification {
  koreanName: string;
  englishName: string;
  birth: string;
  role: string;
  qualification: string;
  certificateNo: string;
  issuingBody: string;
}

type DiverRow = readonly [string, string, string, string, string, string];

const SOURCE_ROWS: readonly DiverRow[] = [
  ['곽동원', 'Gwak Dongwon', '19970521', 'DIVER', 'Technician Diver', '19641507611A'],
  ['김동우', 'Kim Dongu', '19961205', 'DIVER', 'Technician Diver', '22402130572M'],
  ['김동욱', 'Kim Donguk', '19930115', 'DIVER', 'Technician Diver', '14642001570I'],
  ['김명호', 'Kim Myeongho', '19960211', 'DIVER', 'Technician Diver', '13404211006R'],
  ['김상완', 'Kim Sangwan', '19920727', 'DIVER', 'Industrial Engineer Diver', '19203210119C'],
  ['김선준', 'Kim Seonjun', '19880609', 'DIVER', 'Industrial Engineer Diver', '12202190284I'],
  ['김정겸', 'Kim Jeonggyeom', '19910101', 'DIVER', 'Industrial Engineer Diver', '13202211248B'],
  ['김정원', 'Kim Jeongwon', '19930325', 'DIVER', 'Technician Diver', '11405211078M'],
  ['김지안', 'Kim Jian', '19870623', 'DIVER', 'Technician Diver', '25403190228Q'],
  ['노승민', 'Noh Seungmin', '19890510', 'DIVER', 'Technician Diver', '13402190195B'],
  ['박정혁', 'Park Jeonghyeok', '19850109', 'DIVER', 'Industrial Engineer Diver', '18203210156G'],
  ['박준령', 'Park Junryeong', '19931108', 'DIVER', 'Industrial Engineer Diver', '19203190043H'],
  ['박진현', 'Park Jinhyeong', '19930826', 'DIVER', 'Industrial Engineer Diver', '13202211244X'],
  ['배요셉', 'Bae Yosep', '19890923', 'DIVER', 'Industrial Engineer Diver', '18203190026F'],
  ['서진호', 'Seo Jinho', '19900206', 'DIVER', 'Industrial Engineer Diver', '24203210117D'],
  ['손병억', 'Son Byeongeok', '19920414', 'DIVER', 'Industrial Engineer Diver', '16202190147E'],
  ['송진영', 'Song Jinyeong', '19930806', 'DIVER', 'Industrial Engineer Diver', '13202211251W'],
  ['신현각', 'Shin Hyeongak', '19831102', 'DIVER', 'Technician Diver', '21403190260A'],
  ['윤상석', 'Yoon Sangseok', '19930315', 'DIVER', 'Technician Diver', '14404190151E'],
  ['이기용', 'Lee Giyong', '19960820', 'DIVER', 'Technician Diver', '15404031684X'],
  ['이동수', 'Lee Dongsu', '19900205', 'DIVER', 'Technician Diver', '16404190432M'],
  ['이병화', 'Lee Byeonghwa', '19751120', 'DIVER', 'Industrial Engineer Diver', '18203190069Q'],
  ['이수경', 'Lee Sugyeong', '19890616', 'DIVER', 'Technician Diver', '13402210727Z'],
  ['이승원', 'Lee Seungwon', '19860330', 'DIVER', 'Technician Diver', '17402210788Q'],
  ['이용하', 'Lee Yongha', '19810325', 'DIVER', 'Technician Diver', '23403210474Q'],
  ['이준범', 'Lee Junbeom', '19960102', 'DIVER', 'Industrial Engineer Diver', '18203190042F'],
  ['이태성', 'Lee Taeseong', '19910918', 'DIVER', 'Industrial Engineer Diver', '16202190143A'],
  ['임경훈', 'Lim Gyeonghun', '19950505', 'DIVER', 'Technician Diver', '15404031650N'],
  ['정재훈', 'Jung Jaehun', '19970130', 'DIVER', 'Technician Diver', '14404032001P'],
  ['조성민', 'Cho Seongmin', '19971103', 'DIVER', 'Technician Diver', '25403190193W'],
  ['지민수', 'Ji Minsu', '19850529', 'DIVER', 'Industrial Engineer Diver', '23203210101U'],
  ['최정원', 'Choi Jeongwon', '19910829', 'DIVER', 'Industrial Engineer Diver', '16202210158Z'],
  ['표가람', 'Pyo Garam', '19931106', 'DIVER', 'Technician Diver', '17402210829I'],
  ['허휘수', 'Heo Hwisu', '19920626', 'DIVER', 'Industrial Engineer Diver', '12202210912F'],
  ['황동현', 'Hwang Donghyeon', '19911216', 'DIVER', 'Technician Diver', '15402031937L'],
  ['정혁채', 'Jung Hyeokchae', '19841209', 'DIVER', 'Technician Diver', '14402190130L'],
  ['최정영', 'Choi Jeongyeong', '19840907', 'DIVER', 'Technician Diver', '18402190257D'],
  ['서진석', 'Seo Jinseok', '19910228', 'DIVER', 'Technician Diver', '23402130735P'],
  ['오태흥', 'Oh Taeheung', '19821204', 'DIVER', 'Technician Diver', '08405211158Q'],
  ['이상범', 'Lee Sangbeom', '19861121', 'DIVER', 'Industrial Engineer Diver', '09202211196K'],
  ['정범진', 'Jung Beomjin', '19851028', 'DIVER', 'Technician Diver', '16404190311E'],
  ['김동성', 'Kim Dongseong', '19871028', 'DIVER', 'Technician Diver', '15402190377H'],
  ['박재근', 'Park Jaegeun', '19910809', 'DIVER', 'Industrial Engineer Diver', '16202190145C'],
  ['우동훈', 'Woo Donghun', '19920811', 'DIVER', 'Technician Diver', '17403190327G'],
  ['우명규', 'Woo Myeonggyu', '19860912', 'DIVER', 'Technician Diver', '13404190231C'],
  ['유시라', 'Yoo Sira', '19971031', 'DIVER', 'Technician Diver', '25401190174D'],
  ['이태종', 'Lee Taejong', '19900506', 'DIVER', 'Industrial Engineer Diver', '14202190424E'],
  ['정준영', 'Jung Junyeong', '19920908', 'DIVER', 'Technician Diver', '25401130533A'],
  ['지명석', 'Ji Myeongseok', '19880721', 'DIVER', 'Industrial Engineer Diver', '1502190501B'],
] as const;

export const DIVER_QUALIFICATIONS: readonly DiverQualification[] = SOURCE_ROWS.map(([
  koreanName, englishName, birth, role, qualification, certificateNo,
]) => ({
  koreanName,
  englishName,
  birth,
  role,
  qualification,
  certificateNo,
  issuingBody: 'HRDK',
}));

const normalizeSearch = (value: string) => value.toLocaleLowerCase().replace(/[\s-]+/g, '');

export function searchDiverQualifications(query: string): DiverQualification[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [...DIVER_QUALIFICATIONS];
  const exact = DIVER_QUALIFICATIONS.filter((person) => [
    person.koreanName,
    person.englishName,
    person.certificateNo,
  ].some((value) => normalizeSearch(value) === normalized));
  if (exact.length) return exact;
  return DIVER_QUALIFICATIONS.filter((person) => normalizeSearch([
    person.koreanName,
    person.englishName,
    person.qualification,
    person.certificateNo,
  ].join(' ')).includes(normalized));
}
