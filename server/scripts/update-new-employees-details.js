/**
 * 更新三位新 AI 员工的详细信息
 * 添加 employeeBio、skills、workExperience、certifications
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateEmployeesDetails() {
  try {
    console.log('开始更新 AI 员工详细信息...\n');

    // 1. 更新林溪源 Vera
    const vera = await prisma.assistant_templates.updateMany({
      where: { employeeName: '林溪源 Vera' },
      data: {
        employeeBio: '8年数据挖掘与商业分析经验，擅长从海量数据中发现异常模式、挖掘隐藏价值。曾主导多个大型企业的数据驱动决策项目，帮助客户通过数据洞察优化业务流程、降低风险。以批判性思维和证据为先的工作方式著称，善于用尖锐但建设性的方式推动团队改进。',
        
        skills: JSON.stringify([
          '数据挖掘',
          '异常检测',
          '批判性分析',
          '商业洞察',
          '统计建模',
          '风险预警'
        ]),
        
        workExperience: JSON.stringify([
          {
            company: '某大型互联网公司',
            position: '高级数据分析师',
            duration: '2019-2024',
            description: '主导用户行为分析与风险预警系统建设'
          },
          {
            company: '某金融科技公司',
            position: '数据挖掘工程师',
            duration: '2016-2019',
            description: '负责反欺诈模型开发与异常交易检测'
          }
        ]),
        
        certifications: JSON.stringify([
          { name: '数据科学专家认证', count: 2 },
          { name: '商业分析师认证', count: 1 }
        ]),
      },
    });
    console.log(`✅ 已更新：林溪源 Vera（${vera.count} 条记录）`);

    // 2. 更新程远帆 Ethan
    const ethan = await prisma.assistant_templates.updateMany({
      where: { employeeName: '程远帆 Ethan' },
      data: {
        employeeBio: '10年项目管理与团队协作经验，专注于复杂项目的规划、执行与风险控制。曾成功交付多个跨部门、跨地域的大型项目，擅长在不确定性中保持稳定、在压力下灵活应变。以务实、陪伴式的管理风格著称，善于通过对比分析和追根溯源发现问题本质，帮助团队在波动中找到方向。',
        
        skills: JSON.stringify([
          '项目规划',
          '风险管理',
          '对比分析',
          '团队协作',
          '敏捷管理',
          '问题溯源'
        ]),
        
        workExperience: JSON.stringify([
          {
            company: '某跨国科技公司',
            position: '高级项目经理',
            duration: '2018-2024',
            description: '主导多个千万级项目的规划与交付，团队规模20-50人'
          },
          {
            company: '某制造业集团',
            position: '项目管理工程师',
            duration: '2014-2018',
            description: '负责数字化转型项目的执行与风险控制'
          }
        ]),
        
        certifications: JSON.stringify([
          { name: 'PMP 项目管理专业人士认证', count: 1 },
          { name: 'ACP 敏捷管理认证', count: 1 },
          { name: 'PRINCE2 项目管理认证', count: 1 }
        ]),
      },
    });
    console.log(`✅ 已更新：程远帆 Ethan（${ethan.count} 条记录）`);

    // 3. 更新沈清禾 Clara
    const clara = await prisma.assistant_templates.updateMany({
      where: { employeeName: '沈清禾 Clara' },
      data: {
        employeeBio: '12年项目审核与战略咨询经验，专注于项目可行性分析、风险评估与战略规划。曾为多家大型企业和公益组织提供项目审核服务，擅长从全局视野出发把控细节，在逻辑理性中融入人文共情。以温和但坚定的风格著称，能在高压环境下保持沉稳，帮助团队做出既有战略高度又具实践深度的决策。',
        
        skills: JSON.stringify([
          '项目审核',
          '战略规划',
          '风险评估',
          '全局分析',
          '细节把控',
          '决策支持'
        ]),
        
        workExperience: JSON.stringify([
          {
            company: '某国际咨询公司',
            position: '高级审核顾问',
            duration: '2017-2024',
            description: '主导大型企业战略项目的审核与评估，涉及金额超10亿'
          },
          {
            company: '某公益基金会',
            position: '项目评估专家',
            duration: '2012-2017',
            description: '负责公益项目的可行性分析与影响力评估'
          }
        ]),
        
        certifications: JSON.stringify([
          { name: '战略管理咨询师认证', count: 2 },
          { name: '项目评估专家认证', count: 1 },
          { name: '风险管理师认证', count: 1 }
        ]),
      },
    });
    console.log(`✅ 已更新：沈清禾 Clara（${clara.count} 条记录）`);

    console.log('\n🎉 所有员工详细信息更新完成！\n');

  } catch (error) {
    console.error('❌ 更新员工信息时出错：', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateEmployeesDetails();

