import type { messagingApi } from '@line/bot-sdk';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

const RULES: string[] = [
  '如需請假或調整預約時間，請於12小時前告知，特殊狀況不在此限。',
  '如遇不可抗力之因素（如：跨縣市遷徙、疾病、家中急故等）無法繼續進行課程，剩餘堂數全額退費。',
  '單堂課程原則上為60分鐘，教練得與學員協調後，依學員狀況、訓練內容進行調整。',
  '課程前後30分鐘在不影響現場教學情況下，可進行與課堂相關的熱身和收操。',
  '訓練期間，若經教練判斷學員因身體狀況有訓練風險，將先行轉介其他醫療資源接受評估處置，待狀況排除再恢復訓練。',
  '若學員未遵守教練指示，或隱匿身體不適及重大疾病，因而造成之任何損傷或傷害，相關責任由學員自行承擔。',
];

// Badge colors per rule, cycling through a palette
const BADGE_COLORS = ['#1B4965', '#2D6A4F', '#3D5A80', '#6D597A', '#3A6B8A', '#5B4B6D'];

function ruleRow(index: number, text: string): FlexComponent {
  const isEven = index % 2 === 0;
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: String(index + 1),
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'center',
          } as FlexComponent,
        ],
        backgroundColor: BADGE_COLORS[index],
        cornerRadius: '20px',
        width: '22px',
        height: '22px',
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
      } as FlexComponent,
      {
        type: 'text',
        text,
        size: 'sm',
        color: '#333333',
        wrap: true,
        flex: 1,
        margin: 'md',
      } as FlexComponent,
    ],
    paddingAll: '10px',
    backgroundColor: isEven ? '#FFFFFF' : '#F6F8FA',
    cornerRadius: '8px',
  } as FlexComponent;
}

export function classNotesCard(): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '上課注意事項',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: '安傑力運動工作室',
          size: 'xs',
          color: '#FFFFFFAA',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: RULES.map((rule, i) => ruleRow(i, rule)),
      paddingAll: '12px',
      spacing: 'sm',
    },
  };
}
