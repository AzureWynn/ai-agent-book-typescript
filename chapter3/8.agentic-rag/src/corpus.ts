import { LawChunk, QuestionSpec } from './types.js';

export const LAWS: LawChunk[] = [
  { id: 'c_hurt', text: '故意伤害他人身体，致人重伤的，处三年以上十年以下有期徒刑。', facets: ['故意伤害'] },
  { id: 'c_defense', text: '为了使国家、公共利益、本人或者他人的人身和财产权利免受正在进行的不法侵害，而采取的制止不法侵害的行为，对不法侵害人造成损害的，属于正当防卫，不负刑事责任。', facets: ['正当防卫'] },
  { id: 'c_drunk', text: '在道路上醉酒驾驶机动车的，处拘役，并处罚金。', facets: ['醉驾'] },
  { id: 'c_murder', text: '故意杀人的，处死刑、无期徒刑或者十年以上有期徒刑；情节较轻的，处三年以上十年以下有期徒刑。', facets: ['故意杀人'] },
  { id: 'c_theft', text: '盗窃公私财物价值一千元至三千元以上的，应当认定为数额较大，予以立案追诉。', facets: ['盗窃立案'] },
  { id: 'c_fraud', text: '诈骗公私财物，数额较大的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金。', facets: ['诈骗量刑'] },
  { id: 'c_negligent', text: '过失伤害他人致人重伤的，处三年以下有期徒刑或者拘役。', facets: ['过失重伤'] },
  { id: 'c_recidivist', text: '被判处有期徒刑以上刑罚的犯罪分子，刑罚执行完毕或者赦免以后，在五年以内再犯应当判处有期徒刑以上刑罚之罪的，是累犯，应当从重处罚。', facets: ['累犯'] },
  { id: 'c_robbery', text: '以暴力、胁迫或者其他方法抢劫公私财物的，处三年以上十年以下有期徒刑。', facets: ['抢劫'] },
  { id: 'c_detention', text: '拘役的期限为一个月以上六个月以下，管制的期限为三个月以上二年以下。', facets: ['刑罚种类'] },
  { id: 'c_bribe', text: '国家工作人员利用职务上的便利，索取他人财物或者非法收受他人财物，为他人谋取利益的，是受贿罪。', facets: ['受贿'] },
  { id: 'c_traffic', text: '违反交通运输管理法规，因而发生重大事故，致人重伤、死亡的，处三年以下有期徒刑或者拘役。', facets: ['交通肇事'] },
];

export const QUESTIONS: QuestionSpec[] = [
  {
    query: '故意伤害致人重伤的，如何处罚',
    relevant: ['c_hurt'],
    facets: ['故意伤害'],
    subqueries: ['故意伤害致人重伤'],
    difficulty: 'easy',
  },
  {
    query: '正当防卫是怎么规定的',
    relevant: ['c_defense'],
    facets: ['正当防卫'],
    subqueries: ['正当防卫规定'],
    difficulty: 'easy',
  },
  {
    query: '醉酒驾驶机动车如何处罚',
    relevant: ['c_drunk'],
    facets: ['醉驾'],
    subqueries: ['醉酒驾驶处罚'],
    difficulty: 'easy',
  },
  {
    query: '醉酒驾车致人重伤，且有盗窃前科，怎么量刑',
    relevant: ['c_drunk', 'c_negligent', 'c_recidivist'],
    facets: ['醉驾', '过失重伤', '累犯'],
    subqueries: ['醉酒驾驶处罚', '过失致人重伤', '累犯从重处罚'],
    difficulty: 'hard',
  },
  {
    query: '故意伤害致人重伤且是累犯如何处罚',
    relevant: ['c_hurt', 'c_recidivist'],
    facets: ['故意伤害', '累犯'],
    subqueries: ['故意伤害致人重伤', '累犯从重处罚'],
    difficulty: 'hard',
  },
  {
    query: '诈骗且有盗窃前科怎么判',
    relevant: ['c_fraud', 'c_recidivist'],
    facets: ['诈骗量刑', '累犯'],
    subqueries: ['诈骗量刑标准', '累犯从重处罚'],
    difficulty: 'hard',
  },
  {
    query: '醉酒驾驶并抢劫如何处罚',
    relevant: ['c_drunk', 'c_robbery'],
    facets: ['醉驾', '抢劫'],
    subqueries: ['醉酒驾驶处罚', '抢劫处罚'],
    difficulty: 'hard',
  },
  {
    query: '诈骗数额较大且是累犯，之前还醉酒驾驶过',
    relevant: ['c_fraud', 'c_recidivist', 'c_drunk'],
    facets: ['诈骗量刑', '累犯', '醉驾'],
    subqueries: ['诈骗量刑标准', '累犯从重处罚', '醉酒驾驶处罚'],
    difficulty: 'hard',
  },
];
