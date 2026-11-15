type Member = {
  name: { en: string; zh: string };
  linkedin: string;
  github: string;
  website?: string;
  photo: string;
  en: [role: string, description: string];
  zh: [role: string, description: string];
};

export const team: Member[] = [
  {
    name: { en: 'Mu-En Chiu', zh: '邱沐恩' },
    photo: 'muen-chiu.jpg',
    linkedin: 'https://www.linkedin.com/in/muen1019/',
    github: 'https://github.com/muen1019',
    website: 'https://muenchiu.com',
    en: ['Negotiation agents', 'Designed and built the buyer and seller agents at the core of TurnDeal.'],
    zh: ['協商代理人', '設計並開發 TurnDeal 核心的買家與賣家代理人。'],
  },
  {
    name: { en: 'Yung-Chi Huang', zh: '黃詠綺' },
    photo: 'yung-chi-huang.jpg',
    linkedin: 'https://www.linkedin.com/in/yung-chi-huang/',
    github: 'https://github.com/ki225',
    en: ['Buyer experience', 'Built the request refinement flow and tested it through the buyer’s final decision.'],
    zh: ['買家體驗', '開發讓買家補充和調整需求的功能，並測試從修改需求到選定報價的流程。'],
  },
  {
    name: { en: 'Jonathan Peng', zh: '彭祈恩' },
    photo: 'jonathan-peng.jpg',
    linkedin: 'https://www.linkedin.com/in/jonathan-peng-292ba517a/',
    github: 'https://github.com/jonathan0626',
    website: 'https://jonathan-peng.com',
    en: ['Product engineering', 'Built the request and discovery workflow and helped integrate the mobile shopping experience.'],
    zh: ['產品工程', '開發需求處理和商品搜尋功能，並協助整合手機版購物流程。'],
  },
  {
    name: { en: 'Ling-Cheng Tseng', zh: '曾令城' },
    photo: 'ling-cheng-tseng.jpg',
    linkedin: 'https://www.linkedin.com/in/ling-cheng-tseng-489a00306/',
    github: 'https://github.com/itisJoshuaTseng',
    en: ['Product concept', 'Brought the initial negotiation idea to the team and shaped it together at the hackathon.'],
    zh: ['產品構想', '提出讓代理人代為議價的構想，並在黑客松和團隊一起做出原型。'],
  },
];
