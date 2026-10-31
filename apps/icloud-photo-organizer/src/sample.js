// SPEC에 고정된 예시 묶음. 항상 새 객체로 돌려준다(호출마다 복제).
const ENTRIES = [
  ['IMG_0001.HEIC', 2000000000],
  ['IMG_0001.MOV', 3800000000],
  ['IMG_0002.HEIC', 1600000000],
  ['IMG_E0002.JPG', 1500000000],
  ['IMG_0003.HEIC', 1000000000],
  ['IMG_0003(1).HEIC', 1900000000],
  ['IMG_0004.HEIC', 600000000],
];

const CSV_LINES = [
  'imgName,fileChecksum,favorite,hidden,deleted,originalCreationDate,viewIndex,importDate',
  'IMG_0001.HEIC,AbC1,0,0,0,"Saturday Aug 10,2019 3:45 PM GMT",1,"Sunday Sep 1,2019 9:00 AM GMT"',
  'IMG_0001.MOV,Mv1,0,0,0,"Saturday Aug 10,2019 3:45 PM GMT",2,"Sunday Sep 1,2019 9:00 AM GMT"',
  'IMG_0002.HEIC,Ed2,0,0,0,"Sunday Sep 1,2019 10:00 AM GMT",3,"Sunday Sep 1,2019 9:00 AM GMT"',
  'IMG_E0002.JPG,De2,0,0,0,"Sunday Sep 1,2019 10:00 AM GMT",4,"Sunday Sep 1,2019 9:00 AM GMT"',
  'IMG_0003.HEIC,Ab3,0,0,0,"Sunday Jan 5,2020 8:30 AM GMT",5,"Sunday Sep 1,2019 9:00 AM GMT"',
  'IMG_0003(1).HEIC,Cp3,0,0,0,"Sunday Jan 5,2020 8:30 AM GMT",6,"Sunday Sep 1,2019 9:00 AM GMT"',
  'IMG_0004.HEIC,Ab4,0,0,0,"Tuesday Feb 11,2020 9:12 PM GMT",7,"Sunday Sep 1,2019 9:00 AM GMT"',
];

export function getSample() {
  return {
    entries: ENTRIES.map(([name, size]) => ({ name, size })),
    csvText: CSV_LINES.join('\n') + '\n',
    discard: { liveVideo: true, copy: true, editedOriginal: true },
  };
}
