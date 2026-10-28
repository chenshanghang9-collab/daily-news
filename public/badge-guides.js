// Original Chinese working notes. Source dates belong to the references, not these guides.
const references = {
  software: { source: 'Evolis', title: 'ID-ALL 制卡软件功能介绍', publishedAt: '2025-06-11', url: 'https://www.evolis.com/blog/we-tested-id-all-for-you-the-new-id-card-creation-software/' },
  direct: { source: 'Evolis', title: '直接证卡打印技术介绍', publishedAt: '2025-04-23', url: 'https://www.evolis.com/blog/everything-need-to-know-about-direct-to-card-printing-technology/' },
  retransfer: { source: 'Evolis', title: '再转印证卡打印技术介绍', publishedAt: '2025-01-31', url: 'https://www.evolis.com/blog/what-is-a-retransfer-card-printer/' },
  nameplate: { source: 'Trotec 卓泰克', title: '多种不同 TroLase 雕刻材料制作的胸牌', publishedAt: null, url: 'https://www.troteclaser.com/zh/resources/laser-projects/name-tags-engraving-materials' },
};
const heading = text => ({ type: 'heading', text });
const paragraph = text => ({ type: 'paragraph', text });
const list = (...items) => ({ type: 'list', items });
const guide = (id, section, title, summary, refs, blocks) => ({
  id, section, title, summary, category: 'badges', kind: 'guide', source: '日常实用指南',
  publishedAt: null, status: 'full', url: refs[0].url, references: refs, blocks,
});

export const badgeGuides = [
  guide('bade000000000001', 'workflow', '从名单到成品：批量工牌、校牌的制作流程', '先把名单和照片对应好，再做模板、打样与分批校对，减少返工。', [references.software], [
    paragraph('适用于带姓名、编号和照片的工牌、校牌。下面是日常整理的工作建议，具体软件功能以所用版本为准。'),
    heading('1. 接单时把成品说清楚'),
    list('记录成品尺寸、横竖方向、单双面、数量、交期和交付方式。', '确认卡片材质、挂孔、挂绳或卡套；需要编码时，另行确认芯片和编码要求。', '请客户确认标志、名单、照片和文字的最终版本，给每批资料标上版本号。'),
    heading('2. 整理一份可追溯的名单'),
    list('每行对应一人，姓名、编号、部门或班级分别放在固定列。', '用唯一编号关联照片；不要只用同名姓名区分人员。保留编号中的前导零。', '先找出缺照片、重复编号、空姓名和照片无法对应的记录，补齐后再排版。'),
    heading('3. 做模板，先打样再批量'),
    paragraph('将固定图文放进模板，把变化的姓名、照片等字段关联名单。Evolis 的 ID-ALL 介绍提到 Excel/CSV 连接、动态字段和批量打印；这些功能取决于软件版本，自动双面还取决于打印机。'),
    list('用长姓名、短姓名、不同照片各做一张样卡，检查裁切、清晰度、正反面对应和挂孔位置。', '让客户确认实物样卡或约定的校样，留下确认记录，再使用同一版本批量制作。', '按部门或班级分批，核对数量、抽查照片与文字、检查附件；把补做和作废卡单独登记。'),
  ]),
  guide('bade000000000002', 'workflow', '胸牌与徽章：从接单、打样到背扣装配', '把尺寸、材料、图案和背扣先确认好，再安排适合的加工流程。', [references.nameplate], [
    paragraph('胸牌、姓名牌和徽章的工艺差别很大。下面把通用接单检查与雕刻胸牌示例分开，实际生产按材料、设备和样品要求安排。'),
    heading('接单确认单'),
    list('确认成品外形、尺寸、数量和用途，异形件需标清方向。', '确认材料、厚度、颜色、表面效果、文字是否变化，以及客户提供的标志文件。', '确认背面是别针、磁铁还是其他扣件，约定佩戴方向、包装和交期。', '徽章如涉及冲压、珐琅或滴胶，应另外确认模具、色号和工艺样；不要套用雕刻胸牌参数。'),
    heading('雕刻胸牌的工作顺序'),
    paragraph('卓泰克官方教程采用雕刻材料制作胸牌，过程包括调整图稿、雕刻切割、清洁组装和安装背磁铁或别针。教程中的机器和材料参数只适用于其示例。'),
    list('按实际材料和厚度调整图稿，先用边料试做，检查细字、边缘和正反方向。', '确认试样后加工，去除残留并检查表面；粘接按所用胶材说明操作。', '安装背扣后检查方向、牢固程度、佩戴效果和边缘，再包装交付。'),
    heading('留下一张复单记录'),
    paragraph('保存确认稿、成品照片、材料名称、背扣型号和本次实际加工记录。客户补做时先核对原批次，避免只凭口头名称重做。'),
  ]),
  guide('bade000000000003', 'tips', '批量制卡少出错：照片、编号和双面对应怎么查', '把容易漏掉的对应关系放在打印前检查，长姓名和缺照片也要单独试样。', [references.software], [
    heading('打印前先查数据'),
    list('以唯一编号作为照片和记录的对应依据，单独列出重复编号与缺失照片。', '将学号、工号作为文本处理，导入后复查前导零和长编号。', '名单排序后再次检查照片关联，避免图片仍按旧行号排列。'),
    heading('用最容易出问题的记录打样'),
    list('选最长姓名、较长部门名称和背景明暗不同的照片，检查字号与裁切。', '双面卡把正反面关联一起检查，先少量试印；有无自动双面能力取决于设备。', '核对条码或二维码的实际读取结果，不只看屏幕上的图形。'),
    heading('分批交付，保留版本'),
    paragraph('按班级或部门分批清点。修订名单用新版本号，标记哪些卡需补印，并核对旧卡处理情况。这里是本站的校对建议；字段连接、批量和条件打印等软件功能需另核对版本。'),
  ]),
  guide('bade000000000004', 'tips', '卡边留白、满版和耐磨：打样前先选对印制方式', '直接打印与再转印的卡边表现不同，先把客户对边缘和使用寿命的要求说清楚。', [references.direct, references.retransfer], [
    heading('图案需要做到卡边吗？'),
    paragraph('Evolis 的技术说明指出，直接证卡打印通常会留下细窄白边；再转印先将图像印在膜上再转到卡片，可实现超边缘覆盖。接单时先向客户说明样卡边缘效果，再确定图稿。'),
    heading('卡片表面和材料也会影响选择'),
    paragraph('直接打印要求卡面平整光滑。带芯片、表面不平或更换材料时，先核对设备与耗材兼容性并打样，不要仅凭“都是白卡”判断。'),
    heading('经常摩擦的卡，先做耐用性确认'),
    list('确认是否长期放在卡套里、是否常与衣物或其他物件摩擦。', '需要更耐磨时，核对覆膜选件、耗材和额外工序，并以实际样卡确认效果。', '保留客户确认样，让颜色、卡边和表面效果有可对照的依据。'),
  ]),
  guide('bade000000000005', 'tips', '再转印订单核价：色带之外，还要看哪些项目', '把转印膜、样卡、损耗和后道工序一起列出来，报价更容易复核。', [references.retransfer], [
    heading('先看清两类耗材'),
    paragraph('按 Evolis 对再转印工艺的说明，图像先打印到转印膜，再经热压转到卡片。因此色带和转印膜是不同耗材，核价时应分别确认型号、适用设备和标称容量。'),
    heading('给每个订单列一张成本表'),
    list('卡片、色带、转印膜分别记录实际采购规格与成本。', '单双面、样卡、调试和废卡会影响耗用，按实际生产记录估算。', '编码、覆膜、打孔、挂绳、卡套、背扣和包装逐项确认是否包含。', '另计资料整理、照片处理、校对、人工和交付；客户修改与补做规则在接单时约定。'),
    heading('用实际批次修正估算'),
    paragraph('完工后记录合格数、作废数和耗材用量，下次按相近订单复核。这里提供核价思路，不给通用单价或保证产能；具体费用需要结合你家的设备、材料和工序计算。'),
  ]),
  guide('bade000000000006', 'tips', '胸牌小字、切边与背扣：交付前的检查清单', '把屏幕稿变成实物后，再检查文字、边缘和佩戴方向。', [references.nameplate], [
    heading('图稿看着清楚，实物也要看得清'),
    list('用实际尺寸查看小字和细线，检查标志是否有缺线、粘连或过细的问题。', '试做后检查文字、切边、孔位与最窄连接处，再确认是否适合批量加工。', '雕刻速度、功率、透镜和加工方向按实际机器及材料试样，不直接照搬其他案例。'),
    heading('背扣装配后再做一次成品检查'),
    paragraph('卓泰克的胸牌教程列有清洁、组装，以及安装磁铁板或别针的步骤。日常建议在这些工序之后，重新核对佩戴方向、连接牢固程度和可见胶痕。'),
    list('按客户确认稿复查姓名与职务，个性化件要与对应包装一起清点。', '检查边缘、表面和背扣，防止漏装或方向不一致。', '留存一张成品照和材料、扣件记录，方便复单与补做。'),
  ]),
];
