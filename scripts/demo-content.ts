type SourceKey = keyof typeof sources;
type Leaf = [title: string, overview: string, nursingFocus: string, check: string, source?: SourceKey];
type Section = [title: string, overview: string, source: SourceKey, leaves: Leaf[]];
type Domain = [title: string, overview: string, source: SourceKey, sections: Section[]];

const sources = {
  safety: ['WHO patient safety', 'https://www.who.int/news-room/fact-sheets/detail/patient-safety/'],
  vital: ['MedlinePlus vital signs', 'https://medlineplus.gov/ency/article/002341.htm'],
  oxygen: ['MedlinePlus pulse oximetry', 'https://medlineplus.gov/lab-tests/pulse-oximetry/'],
  neuro: ['MedlinePlus neurological exam', 'https://medlineplus.gov/lab-tests/neurological-exam/'],
  falls: ['AHRQ Fall TIPS', 'https://www.ahrq.gov/patient-safety/settings/hospital/fall-tips/index.html'],
  pressure: ['AHRQ pressure injury prevention toolkit', 'https://www.ahrq.gov/patient-safety/settings/hospital/resource/pressureulcer/tool/index.html'],
  handoff: ['AHRQ bedside shift report', 'https://www.ahrq.gov/patient-safety/patients-families/engagingfamilies/strategy3/index.html'],
  teachback: ['AHRQ teach-back', 'https://www.ahrq.gov/patient-safety/reports/engage/teachback.html'],
  infection: ['CDC core infection prevention practices', 'https://www.cdc.gov/infection-control/hcp/core-practices/index.html'],
  cauti: ['CDC CAUTI prevention', 'https://www.cdc.gov/uti/hcp/clinical-safety/index.html'],
  iv: ['CDC intravascular catheter recommendations', 'https://www.cdc.gov/infection-control/hcp/intravascular-catheter-related-infections/summary-recommendations.html'],
  tests: ['MedlinePlus medical tests', 'https://medlineplus.gov/lab-tests/'],
  glucose: ['MedlinePlus blood glucose test', 'https://medlineplus.gov/lab-tests/blood-glucose-test/'],
  hypoglycemia: ['CDC low blood sugar', 'https://www.cdc.gov/diabetes/about/low-blood-sugar-hypoglycemia.html'],
  injection: ['CDC safe injection practices', 'https://www.cdc.gov/injection-safety/hcp/clinical-safety/'],
  surgery: ['WHO surgical safety checklist manual', 'https://www.who.int/publications/i/item/9789241598590'],
  sepsis: ['CDC sepsis clinical care', 'https://www.cdc.gov/sepsis/hcp/clinical-care/'],
  medication: ['WHO 5 Moments for Medication Safety', 'https://www.who.int/publications/i/item/WHO-HIS-SDS-2019.4'],
  transitions: ['WHO medication safety in transitions of care', 'https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.9'],
  acetaminophen: ['MedlinePlus acetaminophen', 'https://medlineplus.gov/druginfo/meds/a681004.html'],
  ibuprofen: ['MedlinePlus ibuprofen', 'https://medlineplus.gov/druginfo/meds/a682159.html'],
  metformin: ['MedlinePlus metformin', 'https://medlineplus.gov/druginfo/meds/a696005.html'],
  warfarin: ['MedlinePlus warfarin', 'https://medlineplus.gov/druginfo/meds/a682277.html']
} satisfies Record<string, [string, string]>;

const domains: Domain[] = [
  ['Clinical assessment', 'Assessment connects a current observation with the patient’s baseline, symptoms, and care plan.', 'vital', [
    ['Vital signs', 'Record the measurement, method, and clinical context; a trend may be more useful than one isolated value.', 'vital', [
      ['Blood pressure', 'Blood pressure records the pressure in arteries during and between heartbeats.', 'Use the correct cuff and note position and symptoms with the reading.', 'Recheck an unexpected result and escalate a concerning change using local thresholds.'],
      ['Pulse', 'Pulse assessment includes rate, rhythm, and quality, not just a number.', 'Compare the measured pulse with the patient’s baseline, symptoms, and any monitor reading.', 'Report a new irregular rhythm or a pulse change with dizziness or chest symptoms.'],
      ['Respiratory rate', 'Breathing rate is a core vital sign and can change before other measurements.', 'Count respirations while observing effort, depth, and the patient’s ability to speak.', 'Escalate a new increase in work of breathing or a rate outside the care plan.'],
      ['Temperature', 'Temperature helps frame possible infection or other changes in condition.', 'Record the site and device used so repeat measurements can be compared fairly.', 'Escalate fever or low temperature together with concerning symptoms or deterioration.']
    ]],
    ['Respiratory assessment', 'Observe breathing and oxygenation together; devices provide context but do not replace a patient assessment.', 'oxygen', [
      ['Work of breathing', 'Breathing effort may change even when a displayed oxygen value looks reassuring.', 'Observe posture, speech, accessory muscle use, and visible distress.', 'Seek urgent assessment for sudden distress, exhaustion, or altered consciousness.'],
      ['Oxygen saturation', 'Pulse oximetry estimates blood oxygen saturation noninvasively.', 'Check probe placement and signal quality, and compare the reading with the person’s symptoms.', 'Escalate a low or falling reading according to the ordered target and local protocol.'],
      ['Breath sounds', 'Auscultation findings help describe changes in airflow and secretions.', 'Compare both sides and document where a sound is heard rather than using a vague label.', 'Report a new asymmetric finding or worsening breathlessness.'],
      ['Oxygen device checks', 'Oxygen delivery equipment needs the prescribed device and flow or setting.', 'Confirm the order, connection, fit, and patient tolerance when checking the device.', 'Do not adjust outside the authorized plan; escalate poor response or equipment failure.']
    ]],
    ['Neurologic assessment', 'Repeatable observations make a change in mental or neurologic status easier to recognize.', 'neuro', [
      ['Level of consciousness', 'Alertness is a useful baseline for detecting deterioration.', 'Describe the response to voice and interaction using the local assessment tool.', 'Escalate a new reduction in responsiveness promptly.'],
      ['Orientation', 'Questions about person, place, time, and situation can reveal a change in thinking.', 'Record the specific answers and compare them with the known baseline.', 'Escalate new confusion, especially when paired with infection or abnormal vital signs.'],
      ['Pupil observations', 'Pupil size and response can be part of a focused neurologic assessment.', 'Document each eye separately and use the same method for serial checks.', 'Escalate a new unequal or nonreactive finding under local neurologic protocol.'],
      ['Pain assessment', 'Pain is a patient-reported experience that needs location, quality, and effect on function.', 'Use a suitable scale and reassess after an intervention.', 'Report pain that is sudden, severe, or unlike the patient’s usual pattern.']
    ]],
    ['Fluid and nutrition assessment', 'Intake, output, weight, and swallowing observations can show changes in hydration and nutrition.', 'safety', [
      ['Intake and output', 'A fluid balance record pairs measured intake with urine and other output.', 'Use consistent units and record the time and source of each measurement.', 'Escalate a sustained change in output or a mismatch with symptoms and orders.'],
      ['Hydration observations', 'Hydration assessment combines history, intake, output, and physical findings.', 'Ask about thirst and losses, and compare findings with the clinical plan.', 'Report dizziness, very low output, or other signs of deterioration.'],
      ['Daily weight', 'Weight trends can help monitor fluid status when measured consistently.', 'Use the same scale and similar clothing or timing where possible.', 'Escalate an unexpected change according to the care plan.'],
      ['Swallowing concerns', 'Coughing, wet voice, or difficulty managing food or drink may signal a swallowing problem.', 'Pause oral intake when the care plan requires and request the appropriate assessment.', 'Escalate choking, breathing difficulty, or new inability to swallow.']
    ]]
  ]],
  ['Care and comfort', 'Everyday nursing care combines safety, dignity, comfort, and repeated reassessment.', 'safety', [
    ['Mobility and falls', 'Mobility plans should reflect current strength, balance, equipment, and the patient’s own goals.', 'falls', [
      ['Fall risk review', 'Fall risk changes with illness, medication, environment, and unfamiliar surroundings.', 'Use the local risk tool and agree on practical precautions with the patient.', 'Reassess after a fall, a medication change, or a change in mobility.'],
      ['Assisted transfers', 'A transfer should match the patient’s current ability and the available assistance.', 'Check the planned technique, footwear, lines, and destination before moving.', 'Stop and obtain more help if strength, balance, or cooperation differs from the plan.'],
      ['Supported walking', 'Ambulation can maintain function when it is safe and appropriate.', 'Confirm the prescribed level of support and keep needed aids within reach.', 'Stop for dizziness, breathlessness, or new pain and reassess.'],
      ['Bed mobility', 'Position changes can support comfort and reduce prolonged pressure.', 'Explain the move, protect lines, and use safe handling equipment when indicated.', 'Report new pain or skin changes after movement.']
    ]],
    ['Skin and wound care', 'Skin assessment and pressure injury prevention work best as a documented team plan.', 'pressure', [
      ['Skin inspection', 'Regular observation can identify redness, moisture damage, or breakdown early.', 'Check areas at risk and document location and appearance clearly.', 'Escalate a new open area or persistent discoloration according to local policy.'],
      ['Pressure injury risk', 'Reduced mobility, moisture, and nutrition concerns can increase pressure injury risk.', 'Use the local risk assessment and match prevention measures to identified risks.', 'Reassess when mobility or condition changes.'],
      ['Repositioning plan', 'Repositioning is one part of a broader pressure injury prevention plan.', 'Follow the individualized schedule and consider tolerance, support surfaces, and skin response.', 'Ask for review when pain or instability prevents the planned position change.'],
      ['Wound observations', 'Wound documentation should describe what is visible without guessing a diagnosis.', 'Record site, size or appearance as local policy requires, drainage, and surrounding skin.', 'Escalate spreading redness, unexpected drainage, or sudden worsening.']
    ]],
    ['Personal care', 'Routine care is an opportunity to notice changes while preserving patient choice and privacy.', 'safety', [
      ['Oral care', 'Oral care supports comfort and allows observation of the mouth and lips.', 'Check the patient’s ability to participate and follow the care plan for assistance.', 'Report pain, bleeding, or difficulty swallowing.'],
      ['Bathing assistance', 'Bathing can reveal skin, mobility, and comfort concerns.', 'Offer privacy, safe water temperature, and the level of assistance the patient needs.', 'Stop if the patient becomes dizzy, short of breath, or distressed.'],
      ['Continence care', 'Prompt hygiene and a respectful plan can reduce discomfort and skin exposure to moisture.', 'Document patterns, protect skin as directed, and check for changes from baseline.', 'Escalate new retention, blood, or significant skin breakdown.'],
      ['Sleep support', 'Sleep can be affected by pain, noise, lighting, and overnight care.', 'Ask what interrupts rest and coordinate nonurgent tasks when feasible.', 'Report persistent sleep disruption linked to distress or worsening symptoms.']
    ]],
    ['Communication and teaching', 'Clear handoffs and shared understanding reduce gaps between teams and patients.', 'handoff', [
      ['Bedside handoff', 'A structured shift report makes the current plan and safety concerns visible.', 'Invite the patient to clarify priorities while protecting private information.', 'Confirm outstanding tasks and who owns each next step.'],
      ['Teach-back', 'Teach-back checks whether an explanation was clear by inviting the patient to explain it in their own words.', 'Use plain language and repeat or adapt the explanation when needed.', 'Escalate unresolved barriers to understanding before discharge.', 'teachback'],
      ['Consent and preferences', 'Patient preferences and consent shape how routine care is delivered.', 'Explain the proposed care, seek permission, and record a refusal or concern appropriately.', 'Ask for senior or specialist support when decision-making capacity or consent is unclear.', 'safety'],
      ['Language access', 'Reliable interpretation helps patients understand and participate in care.', 'Use approved interpreter services when language is a barrier, especially for consent and discharge.', 'Avoid assuming a patient understood because they nodded or agreed.', 'safety']
    ]]
  ]],
  ['Infection prevention', 'Standard precautions apply to all patients, with additional measures based on the exposure risk.', 'infection', [
    ['Standard precautions', 'Hand hygiene, protective equipment, injection safety, and respiratory hygiene are core practices.', 'infection', [
      ['Hand hygiene', 'Clean hands reduce transmission between patients, staff, and the care environment.', 'Perform hand hygiene at the indicated moments and after glove removal.', 'Use soap and water when hands are visibly soiled.'],
      ['Glove use', 'Gloves are selected for anticipated contact with blood, body fluids, or contaminated material.', 'Change gloves between tasks and patients; clean hands after removal.', 'Gloves do not replace hand hygiene.'],
      ['Personal protective equipment', 'PPE selection follows the task and likely exposure route.', 'Choose and remove equipment according to local precautions and training.', 'Report a breach or exposure promptly.'],
      ['Respiratory hygiene', 'Covering coughs and managing respiratory secretions reduce exposure opportunities.', 'Offer source control and hand hygiene resources under facility policy.', 'Escalate symptoms requiring additional precautions.']
    ]],
    ['Environment and equipment', 'Cleaning and safe handling of shared items help interrupt indirect transmission.', 'infection', [
      ['High-touch surfaces', 'Frequently touched surfaces need the facility’s specified cleaning process.', 'Follow product contact time and local cleaning responsibilities.', 'Report missed cleaning or a contaminated surface before reuse.'],
      ['Reusable equipment', 'Reusable patient-care equipment needs appropriate cleaning or reprocessing between uses.', 'Check the item’s status before taking it to another patient.', 'Remove damaged or visibly unclean equipment from use.'],
      ['Linen handling', 'Used linen should be contained and handled to avoid spreading contamination.', 'Use designated bags and avoid shaking used textiles.', 'Follow local precautions for visibly contaminated items.'],
      ['Sharps disposal', 'Sharps need immediate disposal into an approved container near the point of use.', 'Keep hands away from the tip and follow the facility’s safe handling policy.', 'Report a needlestick or overfilled container at once.']
    ]],
    ['Device-associated infection prevention', 'Invasive devices require a clear indication, clean handling, and daily review.', 'infection', [
      ['Peripheral IV site review', 'A peripheral access site should be checked for continued need and local problems.', 'Observe the site, dressing, and patient-reported discomfort.', 'Escalate pain, leakage, swelling, or suspected infection.', 'iv'],
      ['Urinary catheter necessity', 'Unnecessary urinary catheter days increase infection exposure.', 'Confirm the current indication and ask whether removal is appropriate.', 'Follow the ordered plan; report a missing indication.', 'cauti'],
      ['Closed urinary drainage', 'Maintaining a closed drainage system supports CAUTI prevention.', 'Check that the system remains intact and drainage is unobstructed.', 'Report disconnection, leakage, or a new urinary concern.', 'cauti'],
      ['Vascular access infection signs', 'Vascular access care includes monitoring for local and systemic changes.', 'Check insertion site, dressing integrity, and symptoms during routine care.', 'Escalate new redness, pain, fever, or device dysfunction.', 'iv']
    ]],
    ['Transmission-based precautions', 'Additional contact, droplet, or airborne measures are used when indicated by the organism and setting.', 'infection', [
      ['Contact precautions', 'Contact precautions reduce spread through direct touch and contaminated surfaces.', 'Check room signage, protective equipment, and dedicated equipment requirements.', 'Clarify the plan when precaution status is uncertain.'],
      ['Droplet precautions', 'Droplet measures address exposure to respiratory droplets at close range.', 'Follow local source-control and mask requirements before entering the care area.', 'Report a lapse in precautions or new respiratory symptoms.'],
      ['Airborne precautions', 'Airborne measures require the specified room and respiratory protection.', 'Confirm room status and staff fit-testing requirements before care.', 'Escalate unavailable protection or room concerns before exposure.'],
      ['Exposure reporting', 'Prompt reporting supports evaluation after a blood or infectious exposure.', 'Follow immediate first-aid and occupational health procedures.', 'Do not delay reporting while waiting for symptoms.']
    ]]
  ]],
  ['Common procedures', 'These pages highlight preparation, observation, documentation, and escalation around common tasks.', 'safety', [
    ['Specimen collection', 'Correct patient, specimen, container, label, and transport details matter as much as collection.', 'tests', [
      ['Urine specimen', 'The collection method depends on the ordered test and the patient’s situation.', 'Confirm container and collection instructions before obtaining the sample.', 'Report contamination or labeling uncertainty rather than submitting an unreliable sample.'],
      ['Blood culture', 'Blood cultures are used when bloodstream infection is being investigated.', 'Follow the ordered collection method and local aseptic protocol.', 'Report a collection problem or delay when urgent treatment is planned.'],
      ['Sputum specimen', 'A sputum sample aims to represent lower respiratory secretions rather than saliva.', 'Explain the collection goal and follow local infection precautions.', 'Report inability to obtain an adequate sample.'],
      ['Stool specimen', 'Stool testing requires the right container and timely handling.', 'Check the order and laboratory instructions, and label at the bedside.', 'Report a spill, contamination, or missing collection time.']
    ]],
    ['Bedside devices', 'Device readings require correct setup and interpretation alongside the patient’s condition.', 'oxygen', [
      ['Pulse oximeter setup', 'A pulse oximeter estimates oxygen saturation from a sensor signal.', 'Check placement, movement, and perfusion when a value seems inconsistent.', 'Escalate a concerning patient assessment even if the display appears normal.'],
      ['ECG lead checks', 'Poor contact or displaced electrodes can create misleading monitor traces.', 'Confirm lead placement and skin contact according to local policy.', 'Assess the patient first when a new alarm or rhythm appears.'],
      ['Bedside glucose check', 'Point-of-care glucose values help guide an ordered diabetes care plan.', 'Use the approved meter and record timing relative to food and treatment.', 'Follow the local response pathway for an unexpected result.', 'glucose'],
      ['Nebulizer setup', 'Nebulized treatment requires the prescribed medicine, device, and patient monitoring.', 'Verify the order and equipment setup using local procedure.', 'Stop and report new distress or intolerance.']
    ]],
    ['Perioperative safety', 'A shared checklist and clear handoffs support safe care before and after procedures.', 'surgery', [
      ['Preoperative checklist', 'The checklist coordinates identity, procedure, site, allergies, and readiness.', 'Confirm each locally required item with the patient and team.', 'Pause and resolve discrepancies before transfer or procedure.'],
      ['Procedure-site verification', 'Site verification is a team safety step for procedures with laterality or multiple sites.', 'Use the facility’s approved marking and time-out process.', 'Speak up when the planned site, consent, or documentation disagrees.'],
      ['Postoperative observation', 'Recovery checks compare airway, circulation, pain, and consciousness with expected findings.', 'Follow the handoff and ordered observation frequency.', 'Escalate unexpected bleeding, breathing difficulty, or reduced responsiveness.'],
      ['Discharge readiness', 'Safe discharge includes clinical stability, instructions, medicines, and follow-up.', 'Use teach-back and confirm the patient has the required support.', 'Resolve gaps in understanding or safety before discharge.', 'teachback']
    ]],
    ['Recognizing deterioration', 'Rapid escalation is a core nursing response when the patient’s condition changes.', 'sepsis', [
      ['Rapid response recognition', 'New instability may appear as altered breathing, consciousness, circulation, or concern from staff or family.', 'Use the local early-warning and rapid response process.', 'Call for immediate help when the patient appears acutely unwell.'],
      ['Basic life support roles', 'Emergency response works best when roles and equipment are clear.', 'Activate the local emergency system and follow current certified training.', 'Do not delay the emergency call while trying to complete documentation.', 'safety'],
      ['Sepsis escalation', 'Sepsis can present with infection plus confusion, fever or low temperature, rapid breathing, or weak circulation.', 'Communicate the suspected infection and observed changes promptly.', 'Treat suspected sepsis as an urgent medical emergency under local protocol.'],
      ['Hypoglycemia response', 'Low glucose can cause sweating, confusion, weakness, or reduced responsiveness.', 'Check glucose when indicated and follow the prescribed or local treatment pathway.', 'Escalate impaired consciousness or failure to improve immediately.', 'hypoglycemia']
    ]]
  ]],
  ['Medicines and medication safety', 'Medication care depends on an accurate list, the current order, safe administration, monitoring, and communication.', 'medication', [
    ['Administration principles', 'Use the current order and local policy to verify the patient, medicine, route, timing, and response.', 'medication', [
      ['Patient identification', 'Identity checks help prevent a medicine reaching the wrong patient.', 'Use the facility’s required identifiers before administration.', 'Stop and resolve any mismatch before giving the medicine.'],
      ['Allergy review', 'An allergy history should be checked against the medicine and documented reaction.', 'Clarify the substance and reaction with the patient when possible.', 'Pause and escalate an unclear or conflicting allergy record.'],
      ['Medication reconciliation', 'Reconciliation compares medicines before and after a care transition.', 'Include prescribed, nonprescription, and other products in the best possible history.', 'Resolve unexplained omissions, additions, or dose changes with the prescriber or pharmacist.', 'transitions'],
      ['Administration documentation', 'A complete record supports continuity and helps prevent duplicate doses.', 'Record administration, omission, and the patient’s response as required.', 'Escalate an error or near miss through the local safety process.']
    ]],
    ['Routes and handling', 'The route and preparation must match the order and the product’s instructions.', 'infection', [
      ['Oral medicines', 'Oral administration requires an appropriate swallowing plan and product formulation.', 'Verify that the patient can take the product as ordered; do not crush without authorization.', 'Escalate vomiting, refusal, or swallowing concerns.'],
      ['Topical medicines', 'Topical products are applied to a specified site and skin condition.', 'Check site, intactness of skin, and product instructions.', 'Report irritation or an unexpected local reaction.'],
      ['Inhaled medicines', 'Inhaled therapies depend on technique and the prescribed device.', 'Observe technique and reinforce the product-specific instructions.', 'Escalate poor response or difficulty using the device.'],
      ['Injection safety', 'Safe injection practice protects the patient and staff from contamination and sharps injury.', 'Prepare in a clean area and use a new sterile needle and syringe as required.', 'Never reuse a syringe or access a medication container with used equipment.', 'injection']
    ]],
    ['Higher-risk medicines', 'Some medicines require tighter checks because errors can cause serious harm.', 'medication', [
      ['Insulin', 'Insulin lowers blood glucose and may cause hypoglycemia if mismatched with the care plan.', 'Verify the product, order, glucose information, meal timing, and monitoring plan.', 'Escalate unexpected glucose or a discrepancy before administration.', 'glucose'],
      ['Anticoagulants', 'Anticoagulants reduce clotting and increase bleeding risk.', 'Check the specific drug, indication, interactions, and required monitoring.', 'Report unusual bleeding, head injury, or a dose discrepancy.', 'warfarin'],
      ['Opioid analgesics', 'Opioids may relieve pain but can suppress breathing or cause excess sedation.', 'Assess pain, alertness, breathing, and the ordered monitoring plan.', 'Escalate reduced responsiveness or slow breathing immediately.', 'medication'],
      ['Concentrated electrolytes', 'Concentrated electrolyte products can be dangerous when prepared or given incorrectly.', 'Use restricted storage, preparation, and independent checks required by local policy.', 'Stop and clarify any concentration or route uncertainty before administration.', 'medication']
    ]],
    ['Common medicine profiles', 'These short profiles are starting points; use the current product information and patient-specific order.', 'medication', [
      ['Acetaminophen', 'Acetaminophen is used for pain and fever; excess total exposure can harm the liver.', 'Check combination products for duplicate acetaminophen and follow the ordered limit.', 'Report a suspected overdose promptly even if symptoms are not yet apparent.', 'acetaminophen'],
      ['Ibuprofen', 'Ibuprofen is a nonsteroidal anti-inflammatory drug used for pain, inflammation, and fever.', 'Review bleeding, kidney, and other medicine risks in the current history.', 'Escalate signs of gastrointestinal bleeding or a new concerning reaction.', 'ibuprofen'],
      ['Metformin', 'Metformin is used in type 2 diabetes management.', 'Check the current order and relevant kidney or acute-illness considerations.', 'Escalate severe illness, dehydration, or a medication discrepancy.', 'metformin'],
      ['Warfarin', 'Warfarin is an anticoagulant that requires regular response monitoring.', 'Check the current INR plan, bleeding symptoms, and interaction changes.', 'Report unusual bleeding or a fall with head injury immediately.', 'warfarin']
    ]]
  ]]
];

export interface DemoArticle { name: string; slug: string; parentSlug: string | null; markdown: string; image?: string }
const slugPart = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const link = (name: string, slug: string) => `- [${name}](/article/${slug})`;
const reference = (key: SourceKey) => `## Source\n\n- [${sources[key][0]}](${sources[key][1]})`;
const note = '> Demonstration overview for browsing this wiki. Use current orders, local policy, and qualified clinical judgment for real care.';
export const demoArticles: DemoArticle[] = [];
const rootSlug = 'demo-nursing-library';
demoArticles.push({ name: 'Nursing practice demo library', slug: rootSlug, parentSlug: null, image: 'images/library-map.png', markdown: `# Nursing practice demo library\n\n${note}\n\nThis collection contains 105 linked articles across assessment, everyday care, infection prevention, procedures, and medicines. Search works by the descriptive article slugs even before labels are generated. Delete this top-level article to remove the entire demo collection.\n\n![Map of the five demo topic areas](images/library-map.png)\n\n## Topic areas\n\n${domains.map(([name]) => link(name, `${rootSlug}-${slugPart(name)}`)).join('\n')}\n\n${reference('safety')}\n` });
for (const [domainName, domainOverview, domainSource, sections] of domains) {
  const domainSlug = `${rootSlug}-${slugPart(domainName)}`;
  demoArticles.push({ name: domainName, slug: domainSlug, parentSlug: rootSlug, markdown: `# ${domainName}\n\n${note}\n\n${domainOverview}\n\n## Sections\n\n${sections.map(([name]) => link(name, `${domainSlug}-${slugPart(name)}`)).join('\n')}\n\n${reference(domainSource)}\n` });
  for (const [sectionName, sectionOverview, sectionSource, leaves] of sections) {
    const sectionSlug = `${domainSlug}-${slugPart(sectionName)}`;
    demoArticles.push({ name: sectionName, slug: sectionSlug, parentSlug: domainSlug, markdown: `# ${sectionName}\n\n${note}\n\n${sectionOverview}\n\n## Articles\n\n${leaves.map(([name]) => link(name, `${sectionSlug}-${slugPart(name)}`)).join('\n')}\n\n[Back to ${domainName}](/article/${domainSlug})\n\n${reference(sectionSource)}\n` });
    for (const [name, overview, focus, check, source = sectionSource] of leaves) {
      const slug = `${sectionSlug}-${slugPart(name)}`;
      demoArticles.push({ name, slug, parentSlug: sectionSlug, markdown: `# ${name}\n\n${note}\n\n${overview}\n\n## Nursing focus\n\n- ${focus}\n- Compare the observation with the patient’s baseline and current care plan.\n- Document the finding and any action according to local policy.\n\n## Check or escalate\n\n${check}\n\n[Back to ${sectionName}](/article/${sectionSlug})\n\n${reference(source)}\n` });
    }
  }
}

if (demoArticles.length !== 106 || new Set(demoArticles.map(a => a.slug)).size !== demoArticles.length
  || demoArticles.some(a => a.slug.length > 160 || a.markdown.length > 6 * 1024 * 1024)) throw new Error('Invalid demo article collection');
