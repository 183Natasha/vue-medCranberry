<template>
  <div>
    <template v-if="selected">
      <!-- Шапка страницы приёма: пациент + режим (новый / просмотр) + навигация -->
      <section class="card visit-head">
        <div class="visit-head-row">
          <h2>
            <template v-if="readOnly">🩺 Приём — {{ selected.fullName }}</template>
            <template v-else>📝 Новый приём — {{ selected.fullName }}</template>
            <span v-if="readOnly" class="badge readonly-badge">только просмотр</span>
          </h2>
          <!-- Дата приёма — метаданные в шапке: в редактировании компактный
               инпут, в readonly — бейдж с датой (раньше дата была отдельной
               строкой в форме и дублировалась в заголовке) -->
          <div class="visit-head-date">
            <label v-if="!readOnly" class="date-inline">Дата
              <input type="datetime-local" v-model="visit.date" required />
            </label>
            <span v-else class="badge">📅 {{ formatVisitTs(visitTs) }}</span>
          </div>
          <div class="visit-head-nav">
            <RouterLink class="btn" :to="'/doctor/patient/' + selected.id">← Пациент</RouterLink>
            <RouterLink class="btn" to="/doctor">👥 Все пациенты</RouterLink>
          </div>
        </div>
      </section>

      <!-- Запись приёма -->
      <section class="card" :class="{ 'visit-readonly': readOnly }">
        <form class="form form-wide" @submit.prevent="saveVisit">
          <!-- В режиме просмотра fieldset[disabled] превращает всю форму в readonly -->
          <fieldset :disabled="readOnly" class="visit-form-body">

          <!-- Жалобы: свободный ввод + критерии ГТР -->
          <fieldset class="visit-section collapsible-sec" id="sec-complaints" :class="{ closed: !openSections['sec-complaints'] }">
            <legend class="collapsible-legend" role="button" @click="toggleSection('sec-complaints')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-complaints'] }">▾</span>
              🩹 Жалобы
            </legend>
            <div class="complaints-cols">
              <div class="complaints-free">
                <label>Жалобы (свободная форма)
                  <textarea v-model="visit.complaints" v-persist-size="'complaints'" rows="6" placeholder="Например: плохой сон, тревога по утрам…"></textarea>
                </label>
              </div>
              <div class="complaints-criteria">
                <CollapsibleBox title="Критерии ГТР (МКБ-10)">
                  <template #badges>
                    <span class="badge" :class="visit.criteria.length ? 'badge-warn' : ''">
                      отмечено: {{ visit.criteria.length }} / {{ GAD_CRITERIA_TOTAL }}
                    </span>
                  </template>
                  <CollapsibleBox
                    v-for="group in GAD_CRITERIA"
                    :key="group.code"
                    :title="`${group.code}. ${group.title}`"
                    class="criteria-group"
                  >
                    <template #badges>
                      <span class="badge">отмечено: {{ groupCriteria(group) }}</span>
                      <span v-if="group.hint" class="muted" style="font-size: 12px">{{ group.hint }}</span>
                    </template>
                    <template v-for="(item, i) in group.items" :key="group.code + i">
                      <p v-if="item.startsWith('—')" class="criteria-subtitle muted">{{ item.slice(1).trim() }}</p>
                      <label v-else class="checkbox">
                        <input
                          type="checkbox"
                          :value="group.code + (i + 1)"
                          v-model="visit.criteria"
                        />
                        <span>{{ item }}</span>
                      </label>
                    </template>
                  </CollapsibleBox>
                </CollapsibleBox>
              </div>
            </div>
          </fieldset>

          <!-- Анамнез заболевания: свободное поле + стресс, ПАВ, синкопы -->
          <fieldset class="visit-section collapsible-sec" id="sec-anamnesis" :class="{ closed: !openSections['sec-anamnesis'] }">
            <legend class="collapsible-legend" role="button" @click="toggleSection('sec-anamnesis')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-anamnesis'] }">▾</span>
              📋 Анамнез заболевания
            </legend>
            <div class="complaints-cols">
              <div class="complaints-free">
                <label>Анамнез заболевания (свободная форма)
                  <textarea v-model="visit.anamnesis" v-persist-size="'anamnesis'" rows="5" placeholder="Начало и течение заболевания, провоцирующие факторы, динамика симптомов…"></textarea>
                </label>
                <label>Длительность симптомов (для диагностики ГТР — критерий более 6 месяцев)
                  <select v-model="visit.symptomDuration">
                    <option value="">— не указано —</option>
                    <option value="less_1m">менее 1 месяца</option>
                    <option value="1_6m">1–6 месяцев</option>
                    <option value="more_6m">более 6 месяцев</option>
                  </select>
                </label>
              </div>
              <div class="complaints-criteria">
                <CollapsibleBox title="Факторы анамнеза заболевания">
                  <template #badges>
                    <span class="badge" :class="visit.anamnesisFactors.length ? 'badge-warn' : ''">
                      отмечено: {{ visit.anamnesisFactors.length }}
                    </span>
                  </template>
                  <div v-for="group in illnessAnamnesis" :key="group.title" class="criteria-group">
                    <p class="criteria-title">{{ group.title }}</p>
                    <div v-for="f in group.items" :key="f.value" class="factor-row" :class="{ checked: visit.anamnesisFactors.includes(f.value) }">
                      <label class="checkbox">
                        <input
                          type="checkbox"
                          :value="f.value"
                          v-model="visit.anamnesisFactors"
                        />
                        <span>{{ f.label }}</span>
                      </label>
                      <div v-if="visit.anamnesisFactors.includes(f.value)" class="factor-warnings">
                        <p v-if="f.drugWarning" class="warning-text">⚠️ {{ f.drugWarning }}</p>
                        <p v-if="f.examWarning" class="warning-text">🔬 {{ f.examWarning }}</p>
                      </div>
                    </div>
                  </div>
                </CollapsibleBox>
              </div>
            </div>
          </fieldset>

          <!-- Анамнез жизни: хронические заболевания слева, гинекология/соматики справа -->
          <fieldset class="visit-section collapsible-sec" id="sec-lifeanamnesis" :class="{ closed: !openSections['sec-lifeanamnesis'] }">
            <legend class="collapsible-legend" role="button" @click="toggleSection('sec-lifeanamnesis')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-lifeanamnesis'] }">▾</span>
              🧬 Анамнез жизни
            </legend>
            <div class="complaints-cols">
              <div class="complaints-free">
                <label>Хронические заболевания (свободная форма)
                  <textarea v-model="visit.chronicConditions" v-persist-size="'chronicConditions'" rows="5" placeholder="Сахарный диабет, ИБС, ХОБЛ, заболевания ЖКТ, эндокринная патология…"></textarea>
                </label>
                <label>Принимаемые препараты
                  <textarea v-model="visit.currentMeds" v-persist-size="'currentMeds'" rows="3" placeholder="Название, доза, длительность приёма…"></textarea>
                </label>
                <label>Операции и травмы
                  <textarea v-model="visit.surgeriesTraumas" v-persist-size="'surgeriesTraumas'" rows="3" placeholder="Аппендэктомия 2015 г., перелом лучевой кости 2018 г.…"></textarea>
                </label>
                <div class="factor-row" :class="{ checked: visit.transfusions }">
                  <label class="checkbox transfusion-toggle">
                    <input type="checkbox" v-model="visit.transfusions" />
                    <span>Гемотрансфузии в анамнезе</span>
                  </label>
                </div>
                <label v-if="visit.transfusions" class="transfusion-details">
                  Детали гемотрансфузий
                  <textarea v-model="visit.transfusionsDetails" v-persist-size="'transfusionsDetails'" rows="2" placeholder="Годы, показания, компоненты (Эр-масса, СЗП), осложнения (посттрансфузионные реакции)…"></textarea>
                </label>
                <label>Аллергии
                  <input type="text" v-model="visit.allergies" placeholder="Лекарственные, пищевые, иные (или «нет»)" />
                </label>
                <p v-if="medInducedWarning" class="warning-text">⚠️ {{ medInducedWarning }}</p>
              </div>
              <div class="complaints-criteria">
                <CollapsibleBox title="Гинекологический и соматический анамнез">
                  <template #badges>
                    <span class="badge" :class="visit.lifeFactors.length ? 'badge-warn' : ''">
                      отмечено: {{ visit.lifeFactors.length }}
                    </span>
                  </template>
                  <div v-for="group in lifeAnamnesis" :key="group.title" class="criteria-group">
                    <p class="criteria-title">{{ group.title }}</p>
                    <div v-for="f in group.items" :key="f.value" class="factor-row" :class="{ checked: visit.lifeFactors.includes(f.value) }">
                      <label class="checkbox">
                        <input
                          type="checkbox"
                          :value="f.value"
                          v-model="visit.lifeFactors"
                        />
                        <span>{{ f.label }}</span>
                      </label>
                      <div v-if="visit.lifeFactors.includes(f.value)" class="factor-warnings">
                        <p v-if="f.drugWarning" class="warning-text">⚠️ {{ f.drugWarning }}</p>
                        <p v-if="f.examWarning" class="warning-text">🔬 {{ f.examWarning }}</p>
                      </div>
                    </div>
                  </div>
                </CollapsibleBox>
              </div>
            </div>
          </fieldset>

          <!-- Общий статус (осмотр) -->
          <fieldset class="visit-section collapsible-sec" id="sec-status" :class="{ closed: !openSections['sec-status'] }">
            <legend class="collapsible-legend" role="button" @click="toggleSection('sec-status')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-status'] }">▾</span>
              🩺 Общий статус
            </legend>
            <div class="status-grid">
              <div
                v-for="f in STATUS_ITEMS"
                :key="f.value"
                class="factor-row status-row"
                :class="{ checked: statusWarning(f) }"
              >
                <div class="checkbox status-field">
                  <span class="status-label">{{ f.label }}</span>
                  <select v-if="f.options" v-model="visit.generalStatus[f.value]">
                    <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <input
                    v-else-if="f.type === 'bp'"
                    type="text"
                    v-model="visit.generalStatus[f.value]"
                    placeholder="120/80"
                  />
                  <input
                    v-else
                    type="text"
                    v-model="visit.generalStatus[f.value]"
                    :placeholder="f.placeholder || ''"
                  />
                </div>
                <div v-if="statusWarning(f)" class="factor-warnings">
                  <p class="warning-text">⚠️ {{ statusWarning(f) }}</p>
                </div>
              </div>
            </div>
          </fieldset>

          <!-- Неврологический статус -->
          <fieldset class="visit-section collapsible-sec" id="sec-neuro" :class="{ closed: !openSections['sec-neuro'] }">
            <legend class="collapsible-legend" role="button" @click="toggleSection('sec-neuro')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-neuro'] }">▾</span>
              🧠 Неврологический статус
            </legend>
            <div class="complaints-cols">
              <!-- Слева: краткий статус для непрофильных специалистов -->
              <div class="complaints-free">
                <p class="criteria-title">Краткий статус (для непрофильных специалистов)</p>
                <div
                  v-for="f in NEURO_QUICK_ITEMS"
                  :key="f.value"
                  class="factor-row status-row"
                  :class="{ checked: statusWarningGeneric(f, visit.neuroQuick) }"
                >
                  <div class="checkbox status-field">
                    <span class="status-label">{{ f.label }}</span>
                    <select v-if="f.options" v-model="visit.neuroQuick[f.value]">
                      <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                    <input v-else type="text" v-model="visit.neuroQuick[f.value]" :placeholder="f.placeholder || ''" />
                  </div>
                  <div v-if="statusWarningGeneric(f, visit.neuroQuick)" class="factor-warnings">
                    <p class="warning-text">⚠️ {{ statusWarningGeneric(f, visit.neuroQuick) }}</p>
                  </div>
                </div>
              </div>
              <!-- Справа: развёрнутый статус для невролога -->
              <div class="complaints-criteria">
                <CollapsibleBox title="Неврологический статус (для невролога)">
                  <template #badges>
                    <span class="badge" :class="neuroDetailedWarnCount ? 'badge-warn' : ''">
                      отклонений: {{ neuroDetailedWarnCount }}
                    </span>
                  </template>
                  <div
                    v-for="f in NEURO_DETAILED_ITEMS"
                    :key="f.value"
                    class="factor-row status-row"
                    :class="{ checked: statusWarningGeneric(f, visit.neuroDetailed) }"
                  >
                    <div class="checkbox status-field">
                      <span class="status-label">{{ f.label }}</span>
                      <select v-if="f.options" v-model="visit.neuroDetailed[f.value]">
                        <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                      <input v-else type="text" v-model="visit.neuroDetailed[f.value]" :placeholder="f.placeholder || 'свободная запись…'" />
                    </div>
                    <div v-if="statusWarningGeneric(f, visit.neuroDetailed)" class="factor-warnings">
                      <p class="warning-text">⚠️ {{ statusWarningGeneric(f, visit.neuroDetailed) }}</p>
                    </div>
                  </div>
                </CollapsibleBox>
              </div>
            </div>
          </fieldset>

          <!-- PHQ-4: экспресс-скрининг и рекомендации по выбору шкалы -->
          <Phq4Questionnaire
            v-model:answers="phq4Answers"
            v-model:saved="phq4Saved"
            :sleep-complaint="phq4SleepComplaint"
            :somatic-criteria="phq4SomaticCriteria"
            :disabled="readOnly"
            @save="savePHQ4"
          />

      <!-- Тестирование: прохождение шкал + ручной ввод результатов -->
      <fieldset class="visit-section collapsible-sec" id="sec-scales" :class="{ closed: !openSections['sec-scales'] }">
        <legend class="collapsible-legend" role="button" @click="toggleSection('sec-scales')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-scales'] }">▾</span>
              📋 Тестирование
            </legend>
        <!-- Предупреждение о рекомендованных шкалам по результатам PHQ-4 -->
        <div v-if="recommendedScaleTitles.length" class="phq4-recommendations">
          <p class="criteria-title">Рекомендованные шкалы по результатам PHQ-4:</p>
          <ul class="recommended-list">
            <li v-for="r in recommendedScaleTitles" :key="r.title">
              <b>{{ r.title }}</b> — <span class="muted">{{ r.reason }}</span>
            </li>
          </ul>
          <p class="muted">Рекомендованные шкалы подсвечены в списке ниже; после прохождения — подсветка снимается.</p>
        </div>
        <p class="muted test-mode-hint" v-if="testMode === ''">Выберите способ: пройти шкалу в интерфейсе или внести готовый результат вручную.</p>

        <div class="test-mode-switch">
          <button
            class="btn test-mode-btn"
            :class="{ active: testMode === 'interactive' }"
            type="button"
            @click="setTestMode('interactive')"
          >📝 Пройти тест</button>
          <button
            class="btn test-mode-btn"
            :class="{ active: testMode === 'manual' }"
            type="button"
            @click="setTestMode('manual')"
          >🧪 Заполнить вручную</button>
        </div>

        <!-- Режим: интерактивное прохождение шкалы -->
        <div v-if="testMode === 'interactive'" class="form">
          <label>Шкала
            <select v-model="scaleKey" required>
              <option
                v-for="s in scaleOptions"
                :key="s.key"
                :value="s.key"
                :class="{ 'scale-recommended': isScaleRecommended(s.key) }"
              >
                {{ s.title }}{{ isScaleRecommended(s.key) ? '  — рекомендована' : '' }}
              </option>
            </select>
          </label>
          <button class="btn btn-primary" type="button" @click="startScale">Начать заполнение</button>
        </div>

        <template v-if="activeScale">
          <h3>{{ activeScale.title }}</h3>
          <p class="muted">{{ activeScale.description }}</p>
          <div class="form">
            <div v-for="(q, qi) in activeScale.questions" :key="qi" class="question">
              <p class="question-text">{{ qi + 1 }}. {{ q.text }}</p>
              <div class="options">
                <label v-for="(opt, oi) in q.options" :key="oi" class="radio">
                  <input
                    type="radio"
                    :name="'q' + qi"
                    :value="opt.score"
                    :checked="scaleAnswers[qi] === opt.score"
                    @change="scaleAnswers[qi] = opt.score"
                  />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
            <div v-if="scaleComplete" class="scale-result">
              <p v-for="r in activeScale.results" :key="r.type">
                <b>{{ r.title }}:</b> {{ r.pick(scaleAnswers) }} балл(ов)
              </p>
            </div>
            <p v-else class="muted">Ответьте на все вопросы — {{ answered }} / {{ activeScale.questions.length }}</p>
            <button class="btn btn-primary" type="button" :disabled="!scaleComplete" @click="saveScale">Сохранить результаты</button>
            <button class="btn" type="button" @click="activeScaleKey = ''">Отмена</button>
            <p v-if="successMsgScale" class="success-text">{{ successMsgScale }}</p>
          </div>
        </template>

        <!-- Режим: ручной ввод результата -->
        <div v-if="testMode === 'manual'" class="form manual-test-box">
          <label>Шкала
            <select v-model="test.type" required>
              <option v-for="(t, key) in TEST_TYPES" :key="key" :value="key">{{ t.name }}</option>
            </select>
          </label>
          <div class="grid-2">
            <label>Балл (0–{{ TEST_TYPES[test.type]?.max || 27 }})
              <input type="number" v-model.number="test.score" min="0" :max="TEST_TYPES[test.type]?.max || 27" required />
            </label>
            <label>Дата
              <input type="date" v-model="test.date" required />
            </label>
          </div>
          <p class="muted" v-if="TEST_TYPES[test.type]">{{ TEST_TYPES[test.type].hint }}</p>
          <div class="form-actions">
            <button class="btn btn-primary" type="button" @click="saveTest">Добавить результат</button>
            <button class="btn" type="button" @click="testMode = ''">Отмена</button>
          </div>
          <p v-if="successMsgTest" class="success-text">{{ successMsgTest }}</p>
        </div>
      </fieldset>

      <!-- Динамика тестов выбранного пациента (сворачиваемый блок, уровень 2 — без рамки) -->
      <CollapsibleBox>

          <template #title>📈 Динамика тестов: {{ selected.fullName }}</template>
          <template #badges>
            <span v-if="significantWarnings.length" class="badge badge-danger">⚠ значимые изменения: {{ significantWarnings.length }}</span>
          </template>
        <p v-if="!selectedTests.length" class="muted">Результатов тестов пока нет.</p>

        <template v-if="hasHads">
          <CollapsibleBox title="HADS (тревога и депрессия)">
            <template #badges>
              <span class="badge" :class="alertClass('HADS_A', lastScore('HADS_A'))">
                🔴 тревога: {{ lastOf('HADS_A') }} / 21 — {{ interpret('HADS_A', lastScore('HADS_A')) }}
              </span>
              <span v-if="trend('HADS_A') !== 0" class="badge" :class="trend('HADS_A') < 0 ? 'badge-ok' : 'badge-danger'">
                {{ trend('HADS_A') < 0 ? '↓' : '↑' }}
              </span>
              <span class="badge" :class="alertClass('HADS_D', lastScore('HADS_D'))">
                🔵 депрессия: {{ lastOf('HADS_D') }} / 21 — {{ interpret('HADS_D', lastScore('HADS_D')) }}
              </span>
              <span v-if="trend('HADS_D') !== 0" class="badge" :class="trend('HADS_D') < 0 ? 'badge-ok' : 'badge-danger'">
                {{ trend('HADS_D') < 0 ? '↓' : '↑' }}
              </span>
            </template>
            <p class="muted chart-hint">{{ TEST_TYPES.HADS_A.hint }}</p>
            <div class="chart-block">
              <LineChart :series="hadsSeries" :max-score="21" title="HADS" />
            </div>
            <div class="grid-2">
              <div>
                <p class="criteria-title">🔴 HADS-A (тревога), {{ (testsByType.HADS_A || []).length }} изм.</p>
                <div class="chart-block">
                  <LineChart :items="testsByType.HADS_A || []" :max-score="21" title="HADS-A" />
                </div>
              </div>
              <div>
                <p class="criteria-title">🔵 HADS-D (депрессия), {{ (testsByType.HADS_D || []).length }} изм.</p>
                <div class="chart-block">
                  <LineChart :items="testsByType.HADS_D || []" :max-score="21" title="HADS-D" />
                </div>
              </div>
            </div>
            <table>
              <thead><tr><th>Дата</th><th>Тревога (A)</th><th>Депрессия (D)</th></tr></thead>
              <tbody>
                <tr v-for="row in hadsTable" :key="row.date">
                  <td>{{ formatDate(row.date) }}</td>
                  <td :class="row.a !== null ? alertClass('HADS_A', row.a) : ''">{{ row.a ?? '—' }}</td>
                  <td :class="row.d !== null ? alertClass('HADS_D', row.d) : ''">{{ row.d ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </CollapsibleBox>
        </template>

        <CollapsibleBox
          v-for="(t, type) in TEST_TYPES"
          :key="type"
          v-show="type !== 'HADS_A' && type !== 'HADS_D' && (testsByType[type] || []).length"
          :title="t.name"
        >
          <template #badges>
            <span class="badge">{{ lastOf(type) }} / {{ t.max }}</span>
            <span class="badge" :class="alertClass(type, lastScore(type))">{{ interpret(type, lastScore(type)) }}</span>
            <span v-if="trend(type) !== 0" class="badge" :class="trend(type) < 0 ? 'badge-ok' : 'badge-danger'">
              {{ trend(type) < 0 ? '↓ улучшение' : '↑ ухудшение' }}
            </span>
          </template>
          <p class="muted chart-hint">{{ t.hint }}</p>
          <div class="chart-block">
            <LineChart :items="testsByType[type] || []" :max-score="t.max" :title="t.name" />
          </div>
          <table>
            <thead><tr><th>Дата</th><th>Балл</th><th>Интерпретация</th></tr></thead>
            <tbody>
              <tr v-for="r in [...(testsByType[type] || [])].reverse()" :key="r.id">
                <td>{{ formatDate(r.date) }}</td>
                <td><b>{{ r.score }}</b> / {{ t.max }}</td>
                <td :class="alertClass(type, r.score)">{{ interpret(type, r.score) }}</td>
              </tr>
            </tbody>
          </table>
        </CollapsibleBox>
        </CollapsibleBox>

      <!-- Диагноз (вводит врач; система проверяет соответствие клиники) -->
      <fieldset class="visit-section collapsible-sec" id="sec-diagnosis" :class="{ closed: !openSections['sec-diagnosis'] }">
        <legend class="collapsible-legend" role="button" @click="toggleSection('sec-diagnosis')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-diagnosis'] }">▾</span>
              🏷️ Диагноз
            </legend>
        <div class="complaints-cols">
          <div class="complaints-free">
            <label>Код МКБ-10 (необязательно)
              <input
                type="text"
                v-model="visit.diagnosisCode"
                list="icd10-codes"
                placeholder="Например: F41.1 (или оставьте пустым)"
              />
              <datalist id="icd10-codes">
                <option v-for="c in ICD10_CODES" :key="c.code" :value="c.code">{{ c.title }}</option>
              </datalist>
            </label>
            <label>Формулировка диагноза
              <textarea
                v-model="visit.diagnosis"
                v-persist-size="'diagnosis'"
                rows="3"
                placeholder="Например: Генерализованное тревожное расстройство, впервые выявленное / Депрессивный эпизод умеренной тяжести / Астено-вегетативный или астено-депрессивный синдром (для непсихиатрического профиля)…"
              ></textarea>
            </label>
            <label>Обоснование
              <textarea
                v-model="visit.diagnosisReason"
                v-persist-size="'diagnosisReason'"
                rows="3"
                placeholder="Клиника, динамика, данные шкал…"
              ></textarea>
            </label>
            <label>Динамика состояния (к предыдущему приёму)
              <select v-model="visit.condition" :class="conditionClass(visit.condition)">
                <option value="Улучшение">Улучшение</option>
                <option value="Без изменений">Без изменений</option>
                <option value="Ухудшение">Ухудшение</option>
              </select>
            </label>
          </div>
          <div class="complaints-criteria">
            <p class="criteria-title">Соответствие клиники диагнозу</p>
            <p v-if="!diagnosisText" class="muted">Введите диагноз — система сопоставит его с данными осмотра, критериями ГТР и шкалами.</p>
            <div v-if="!diagnosisText" class="diagnosis-summary">
              <p class="criteria-title" style="margin-top: 6px">Данные текущего приёма:</p>
              <ul class="recommended-list">
                <li>Жалобы: <b>{{ visit.complaints.trim() ? 'изложены (' + visit.complaints.trim().length + ' симв.)' : 'не внесены' }}</b></li>
                <li>Критерии ГТР: <b>{{ visit.criteria.length }} / {{ GAD_CRITERIA_TOTAL }}</b>
                  <span v-if="visit.criteria.length" class="muted"> (группа A: {{ gadGroupCount('A') }}, группа B: {{ gadGroupCount('B') }})</span></li>
                <li>Анамнез заболевания: <b>{{ visit.anamnesis.trim() ? 'внесён' : 'не внесён' }}</b>; факторов отмечено: <b>{{ visit.anamnesisFactors.length }}</b></li>
                <li>PHQ-4: <b v-if="phq4Complete">{{ phq4Anxiety + phq4Depression }} балл(ов) — тревога {{ phq4Anxiety }}, депрессия {{ phq4Depression }}</b><b v-else>не пройден</b></li>
                <li>Шкалы today: <b v-if="todayScaleResults.length">{{ todayScaleResults.join(', ') }}</b><b v-else>не пройдены</b></li>
              </ul>
              <p v-if="!visit.criteria.length && !todayScaleResults.length" class="warning-text">⚠️ Для осмысленного сопоставления заполните жалобы, критерии ГТР и пройдите PHQ-4 / шкалы — иначе проверить обоснованность диагноза не по чему.</p>
            </div>
            <template v-else>
              <!-- Пошаговый алгоритм диагностики ГТР (дерево решений) -->
              <p class="criteria-title" style="margin-top: 6px">Алгоритм диагностики ГТР:</p>
              <div v-for="s in gadSteps" :key="s.step" class="factor-row" :class="s.ok === false ? 'checked' : ''">
                <div class="factor-warnings">
                  <p v-if="s.ok === true" class="ok-text">✅ {{ s.step }}. {{ s.title }}: {{ s.detail }}</p>
                  <p v-else-if="s.ok === false" class="warning-text">⚠️ {{ s.step }}. {{ s.title }}: {{ s.detail }}</p>
                  <p v-else class="muted">▫ {{ s.step }}. {{ s.title }}: {{ s.detail }}</p>
                </div>
              </div>
              <div v-for="m in diagnosisMatch" :key="m.title" class="factor-row" :class="m.match ? '' : 'checked'">
                <div class="factor-warnings">
                  <p v-if="m.match" class="ok-text">✅ {{ m.title }}: {{ m.detail }}</p>
                  <p v-else class="warning-text">⚠️ {{ m.title }}: {{ m.detail }}</p>
                </div>
              </div>
            </template>
          </div>
        </div>
      </fieldset>

      <!-- Дообследование: базовый набор + исследования по показаниям (КР «ГТР» 2024) -->
      <fieldset class="visit-section collapsible-sec" id="sec-exam" :class="{ closed: !openSections['sec-exam'] }">
        <legend class="collapsible-legend" role="button" @click="toggleSection('sec-exam')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-exam'] }">▾</span>
              🔬 Дообследование
            </legend>
        <div class="complaints-cols">
          <div class="complaints-free">
            <p class="criteria-title">Базовый объём (всем пациентам):</p>
            <div v-for="s in BASE_EXAM_STUDIES" :key="s.key" class="factor-row" :class="{ checked: examRecommendedKeys.includes(s.key) && !visit.examStudies.includes(s.key) }">
              <label class="checkbox">
                <input type="checkbox" :value="s.key" v-model="visit.examStudies" />
                <span>{{ s.label }}</span>
              </label>
              <div v-if="examRecommendedKeys.includes(s.key) && !visit.examStudies.includes(s.key)" class="factor-warnings">
                <p class="warning-text">⚠️ {{ s.why }}</p>
              </div>
            </div>
            <p class="criteria-title" style="margin-top: 10px">Клинические суждения (врача):</p>
            <label class="checkbox">
              <input type="checkbox" v-model="visit.examFlags.paroxysmal" />
              <span>По данным анамнеза, осмотра и анализов нельзя надёжно исключить пароксизмальные состояния</span>
            </label>
            <label class="checkbox">
              <input type="checkbox" v-model="visit.examFlags.vascular" />
              <span>Были эпизоды потери сознания / нельзя надёжно исключить церебральные сосудистые нарушения</span>
            </label>
            <label class="checkbox">
              <input type="checkbox" v-model="visit.examFlags.organic" />
              <span>ЧМТ, подозрение на новообразования, головные боли / нельзя надёжно исключить органическое поражение головного мозга</span>
            </label>
          </div>
          <div class="complaints-criteria">
            <p class="criteria-title">Рекомендовано по данным приёма:</p>
            <p v-if="!examRecommendedKeys.length" class="muted">Показаний помимо базового набора не выявлено — отметьте выполненные базовые исследования слева.</p>
            <div v-for="s in CONDITIONAL_EXAM_STUDIES" v-show="examRecommendedKeys.includes(s.key)" :key="s.key" class="factor-row" :class="{ checked: !visit.examStudies.includes(s.key) }">
              <label class="checkbox">
                <input type="checkbox" :value="s.key" v-model="visit.examStudies" />
                <span>{{ s.label }}</span>
              </label>
              <div class="factor-warnings">
                <p class="warning-text">⚠️ {{ s.why }}</p>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- Лечение ГТР: итеративный подбор терапии (лечение → оценка эффекта → корректировка) -->
      <!-- Доступен после постановки диагноза с шифром F либо астено-вегетативного / астено-депрессивного синдрома, -->
      <!-- а также при COVID-19 в анамнезе (постковидная астения) -->
      <fieldset v-if="anxietyDiagnosed || isPostCovid" class="visit-section collapsible-sec" id="sec-treatment" :class="{ closed: !openSections['sec-treatment'] }">
        <legend class="collapsible-legend" role="button" @click="toggleSection('sec-treatment')">
              <span class="collapsible-chev" :class="{ closed: !openSections['sec-treatment'] }">▾</span>
              💊 Лечение ГТР
            </legend>

        <!-- Немедикаментозная терапия (сворачиваемый раздел) — идёт первой -->
        <CollapsibleBox title="🌿 Немедикаментозная терапия">
          <template #badges>
            <span class="badge" :class="visit.nonDrugTherapy.length ? 'badge-ok' : ''">
              выбрано: {{ visit.nonDrugTherapy.length }} / {{ NON_DRUG_THERAPY.length }}
            </span>
          </template>
          <p class="muted chart-hint">Рекомендуется всем пациентам с ГТР — самостоятельно или в сочетании с фармакотерапией.</p>
          <div class="complaints-cols">
            <div class="complaints-free">
              <div v-for="n in NON_DRUG_THERAPY" :key="n.key" class="factor-row" :class="{ checked: visit.nonDrugTherapy.includes(n.key) }">
                <label class="checkbox">
                  <input type="checkbox" :value="n.key" v-model="visit.nonDrugTherapy" />
                  <span>{{ n.label }}</span>
                </label>
                <div v-if="visit.nonDrugTherapy.includes(n.key) && n.detail" class="factor-warnings">
                  <p class="warning-text">ℹ️ {{ n.detail }}</p>
                </div>
              </div>
            </div>
            <div class="complaints-criteria">
              <p class="criteria-title">Рекомендации по применению:</p>
              <ul class="recommended-list">
                <li>Психотерапия (КПТ) — метод первой линии; курс 12–16 сессий, эффект сохраняется после отмены фармакотерапии.</li>
                <li>Психообразование — снижает тревогу в отношении симптомов, повышает приверженность лечению.</li>
                <li>Методы релаксации и управляемое дыхание — ежедневные тренировки, эффект после 2–4 недель.</li>
                <li>Гигиена сна — стабильный режим, ограничение стимуляторов (кофеин, никотин) и алкоголя.</li>
                <li>Регулярная аэробная физическая активность — 30 минут 3–5 раз в неделю, наращивание интенсивности постепенно.</li>
                <li>Ограничение кофеина и других стимуляторов — при выраженной вегетативной симптоматике.</li>
              </ul>
              <p class="muted">Выбранные методы сохраняются с приёмом; отметка сохраняется между визитами при необходимости — снимите вручную.</p>
            </div>
          </div>
        </CollapsibleBox>

        <!-- Медикаментозная терапия: итеративный подбор антидепрессантов (лечение → оценка эффекта → корректировка) -->
        <CollapsibleBox title="💊 Медикаментозная терапия" open>
          <template #badges>
            <span class="badge">этап: {{ treatmentStageLabel }}</span>
            <span v-if="visit.treatmentDrug" class="badge badge-ok">назначено: {{ visit.treatmentDrug }}{{ visit.treatmentDose ? ' — ' + visit.treatmentDose : '' }}</span>
            <span v-else class="badge">препарат не назначен</span>
          </template>
        <div class="complaints-cols">
            <div class="complaints-free">
              <p class="criteria-title">Текущий этап: <b>{{ treatmentStageLabel }}</b></p>

              <!-- Шаг А: назначение препарата (если ещё не назначен) -->
              <template v-if="!visit.treatmentDrug">
                <p class="criteria-title">Назначение препарата</p>
                <label>Препарат
                  <select v-model="treatmentDrugDraft" :disabled="!treatmentDrugs.length">
                    <option v-if="!treatmentDrugs.length" value="">— завершённый курс —</option>
                    <option v-for="d in treatmentDrugs" :key="d" :value="d">{{ d }}</option>
                  </select>
                </label>
                <div class="grid-2">
                  <label>Доза
                    <select v-if="doseOptions.length" v-model="visit.treatmentDose" :disabled="!treatmentDrugs.length || !treatmentDrugDraft">
                      <option value="">— выберите —</option>
                      <option v-for="d in doseOptions" :key="d" :value="d">{{ d }}</option>
                    </select>
                    <input v-else type="text" v-model="visit.treatmentDose" placeholder="напр. 300 мг/сут" :disabled="!treatmentDrugs.length || !treatmentDrugDraft" />
                  </label>
                  <label>Примечание
                    <input type="text" v-model="visit.treatmentNote" placeholder="переносимость, комплаентность…" :disabled="!treatmentDrugs.length || !treatmentDrugDraft" />
                  </label>
                </div>
                <button
                  class="btn btn-primary"
                  type="button"
                  :disabled="!treatmentDrugDraft || !visit.treatmentDose"
                  @click="assignTreatment"
                >
                  Назначить препарат
                </button>
                <!-- Противопоказания, подтверждённые данными анамнеза (до назначения) -->
                <div v-if="draftContraWarnings.length" class="factor-warnings">
                  <p v-for="w in draftContraWarnings" :key="w" class="warning-text">⚠️ Противопоказание: {{ w }}</p>
                </div>
                <!-- Справка по выбранному препарату: показания / противопоказания / дозировки -->
                <div v-if="draftDrugInfo" class="phq4-recommendations">
                  <p class="criteria-title">Справка: {{ (treatmentDrugDraft || '').split(' ')[0] }}</p>
                  <ul class="recommended-list">
                    <li>
                      Показания к назначению:
                      <b>{{ draftDrugInfo['Показания к назначению'].join(', ') }}</b>
                    </li>
                    <li>
                      ⚠️ Противопоказания:
                      <b>{{ draftDrugInfo['Противопоказания'].join(', ') }}</b>
                    </li>
                    <li>
                      Дозировки:
                      <b>{{ draftDrugInfo['Дозировка'].join(', ') }}</b>
                    </li>
                  </ul>
                </div>
                <p class="muted">Оценка эффекта станет доступна после рекомендованного срока приёма (4–6 недель).</p>
              </template>

              <!-- Шаг Б: идёт приём препарата — оценка эффекта по истечении срока -->
              <template v-else>
                <p class="criteria-title">Назначено</p>
                <div class="diagnosis-summary">
                  <ul class="recommended-list">
                    <li>Препарат: <b>{{ visit.treatmentDrug }}{{ visit.treatmentDose ? ' — ' + visit.treatmentDose : '' }}</b></li>
                    <!-- Авиандр: назначен на этом приёме (чекбокс) → в листе назначений -->
                    <li v-if="visit.prescribeAviandr">Авиандр (малитупердин): <b>внутрь по {{ aviandrDose }}</b></li>
                    <li v-if="visit.treatmentStartDate">Дата назначения: <b>{{ formatDate(visit.treatmentStartDate) }}</b></li>
                    <li>Рекомендованный срок оценки эффекта: <b>{{ treatmentEvalDate }}</b> (4–6 недель приёма)</li>
                    <li v-if="visit.treatmentNote">Примечание: {{ visit.treatmentNote }}</li>
                  </ul>
                </div>
                <!-- Противопоказания назначенного препарата, подтверждённые данными анамнеза -->
                <div v-if="assignedContraWarnings.length" class="factor-warnings">
                  <p v-for="w in assignedContraWarnings" :key="w" class="warning-text">⚠️ Противопоказание: {{ w }}</p>
                </div>
                <!-- Первое установление полного эффекта: рекомендуется продолжить приём 6–12 месяцев -->
                <div v-if="firstFullEffect" class="phq4-recommendations">
                  <p class="criteria-title">Впервые достигнут полный эффект:</p>
                  <p class="warning-text">
                    Рекомендовано продолжить приём текущего препарата ещё <b>6–12 месяцев</b> с возможностью корректировать
                    получаемую терапию (доза, замена, отмена — по клинической динамике). Оценку эффекта повторяйте на каждом
                    визите; при рецидиве (частичный эффект или его отсутствие) — возврат к корректировке терапии по схеме.
                  </p>
                </div>
                <label>Прошло недель с начала приёма
                  <input type="number" v-model.number="visit.treatmentWeeks" min="0" max="104" />
                </label>
                <p v-if="!canEvaluateEffect" class="warning-text">
                  ⚠️ Оценка эффекта доступна с 4-й недели приёма — продолжите терапию до рекомендованного срока ({{ treatmentEvalDate }}).
                </p>
                <label>Оценка эффекта
                  <select v-model="visit.treatmentEffect" :disabled="!canEvaluateEffect">
                    <option value="">— не оценён —</option>
                    <option value="full">полный</option>
                    <option value="partial">частичный</option>
                    <option value="none">нет эффекта</option>
                  </select>
                </label>
                <!-- Предупреждение об оценке до 6 недель -->
                <p v-if="treatmentEarlyWarning" class="warning-text">⚠️ {{ treatmentEarlyWarning }}</p>
                <!-- Рекомендация текущего шага алгоритма -->
                <div v-if="treatmentAdvice" class="factor-warnings">
                  <p :class="treatmentAdvice.kind === 'ok' ? 'ok-text' : 'warning-text'">
                    {{ treatmentAdvice.kind === 'ok' ? '✅' : 'ℹ️' }} {{ treatmentAdvice.text }}
                  </p>
                </div>
                <button
                  class="btn btn-primary"
                  type="button"
                  :disabled="!canEvaluateEffect || !visit.treatmentEffect"
                  @click="applyTreatmentEffect"
                >
                  Зафиксировать оценку и перейти к следующему шагу
                </button>
              </template>
              <button class="btn" type="button" @click="resetTreatment">Новый курс (сброс)</button>
            </div>
            <div class="complaints-criteria">
              <p class="criteria-title">Циклы лечения (история)</p>
              <p v-if="!visit.treatmentHistory.length" class="muted">Завершённых циклов пока нет: выберите препарат, отметьте длительность и эффект, затем зафиксируйте оценку.</p>
              <table v-else>
                <thead><tr><th>Дата</th><th>Этап</th><th>Препарат</th><th>Доза</th><th>Нед.</th><th>Эффект</th><th>Прим.</th></tr></thead>
                <tbody>
                  <tr v-for="(c, i) in [...visit.treatmentHistory].reverse()" :key="i">
                    <td>{{ formatDate(c.date) }}</td>
                    <td>{{ TREATMENT_STAGE_LABELS[c.stage] || c.stage }}</td>
                    <td>{{ c.drug || '—' }}</td>
                    <td>{{ c.dose || '—' }}</td>
                    <td>{{ c.weeks || '—' }}</td>
                    <td><b>{{ { full: 'полный', partial: 'частичный', none: 'нет' }[c.effect] || c.effect }}</b></td>
                    <td class="muted">{{ c.note || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="criteria-title" style="margin-top: 10px">Схема алгоритма:</p>
              <ul class="recommended-list">
                <li>Старт: монотерапия СИОЗС / СИОЗСН / агомелатином 4–6 недель.</li>
                <li>Частичный эффект → доза до максимальной + комплаентность (4–6 недель).</li>
                <li>Нет эффекта → смена антидепрессанта → прегабалин → аугментация.</li>
                <li>Резистентность → терапия резерва (ТЦА, буспирон, комбинации).</li>
              </ul>
            </div>
          </div>
          <!-- АВИАНДР: назначение чекбоксом; дозировка подставляется из справочника DRUG_INFO -->
          <div class="phq4-recommendations" style="margin-top: 10px">
            <p class="criteria-title">Авиандр (малитупердин)</p>
            <label class="checkbox" style="margin: 0">
              <input type="checkbox" v-model="visit.prescribeAviandr" :disabled="readOnly" />
              <span>Назначить авиандр</span>
            </label>
            <p v-if="visit.prescribeAviandr" class="ok-text" style="margin: 6px 0 0">
              — внутрь по <b>{{ aviandrDose }}</b>.
            </p>
          </div>
        </CollapsibleBox>

        <!-- Консультация специалиста: чекбоксы по специальностям из справочника + «Другое» -->
        <CollapsibleBox title="🧑‍⚕️ Консультация специалиста">
          <template #badges>
            <span class="badge" :class="selectedConsultCount ? 'badge-ok' : ''">
              выбрано: {{ selectedConsultCount }} / {{ CONSULTATION_SPECIALTIES.length }}
            </span>
          </template>
          <p class="muted chart-hint">Консультации для дифференциальной диагностики и уточнения сопутствующей патологии.</p>
          <div class="complaints-cols">
            <div class="complaints-free">
              <div v-for="s in CONSULTATION_SPECIALTIES" :key="s.key" class="factor-row" :class="{ checked: visit.consultSpecialties.includes(s.key) }">
                <label class="checkbox">
                  <input type="checkbox" :value="s.key" v-model="visit.consultSpecialties" />
                  <span>{{ s.label }}</span>
                </label>
                <div v-if="visit.consultSpecialties.includes(s.key) && s.detail" class="factor-warnings">
                  <p class="warning-text">ℹ️ {{ s.detail }}</p>
                </div>
              </div>
            </div>
            <div class="complaints-criteria">
              <p class="criteria-title">Когда показана консультация:</p>
              <ul class="recommended-list">
                <li>Кардиолог — выраженная вегетативная симптоматика (сердцебиение, перебои), изменения на ЭКГ.</li>
                <li>Эндокринолог — клиника тиреотоксикоза, патология щитовидной железы в анамнезе.</li>
                <li>Невролог — невозможность надёжно исключить пароксизмальные / сосудистые состояния.</li>
                <li>Психотерапевт — проведение КПТ (метод первой линии при ГТР).</li>
                <li>Психиатр — коморбидная депрессия, тяжёлое течение, терапия резистентности.</li>
              </ul>
            </div>
          </div>
          <!-- «Другое»: свободный ввод специальности/пояснения -->
          <div v-if="visit.consultSpecialties.includes('other')" class="manual-test-box">
            <label>Другое — уточните специалиста / повод
              <input type="text" v-model="visit.consultOther" placeholder="напр. сомнолог — нарушения сна…" />
            </label>
          </div>
        </CollapsibleBox>
        <!-- Сноска: источник рекомендаций -->
        <p class="muted" style="margin-top: 10px; margin-bottom: 0">
          Схемы терапии и диагностики — Клинические рекомендации «Генерализованное тревожное расстройство» 2024 г.
        </p>
      </fieldset>
          </fieldset>

      <!-- Действия: сохранить приём (только в режиме редактирования) + экспорт записи -->
      <div class="visit-actions">
        <button v-if="!readOnly" class="btn btn-primary" type="submit">💾 Сохранить приём</button>

        <div class="export-wrap">
          <button class="btn" type="button" @click="exportOpen = !exportOpen">📤 Экспорт ▾</button>
          <div v-if="exportOpen" class="export-menu">
            <button type="button" @click="exportPdf">📄 PDF / Печать</button>
            <button type="button" @click="exportJson">🧾 JSON</button>
            <button type="button" @click="exportEmail">✉️ Email</button>
          </div>
        </div>

        <p v-if="successMsg" class="success-text">{{ successMsg }}</p>
      </div>
        </form>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, users, type User } from '../auth'
import { TEST_TYPES, conditionClass, getPatient, type Condition, type TestType, type TreatmentCycle, type Visit } from '../store'
import { syncTest, syncAddVisit } from '../services/sync'
import { formatVisitTs, formatDate, formatDateStr, nowTs, tsToDateTimeLocal, dateTimeLocalToTs, dateStrToTs, todayDateTs } from '../services/datetime'
import { SCALES, GAD_CRITERIA, GAD_CRITERIA_TOTAL, ANAMNESIS_GROUPS, type AnamnesisFactorDef } from '../scales'
import {
  lastScore as lastScoreOf,
  lastOf as lastOfIn,
  trend as trendOf,
  interpret as interpretScore,
  alertClass as alertClassOf,
  buildSignificantWarnings,
  hadsSeriesOf,
  hadsTableOf,
} from '../chart-helpers'
import LineChart from '../components/LineChart.vue'
import CollapsibleBox from '../components/CollapsibleBox.vue'
import Phq4Questionnaire from '../components/Phq4Questionnaire.vue'
import { openSections, toggleSection } from '../ui-sections'
import { load as loadFromStorage } from '../services/storage'
import { STORAGE_KEYS } from '../services/storage-keys'
// Справочники осмотра и лечения — предметная область (раньше были здесь)
import {
  type StatusItem,
  STATUS_ITEMS,
  NEURO_QUICK_ITEMS,
  NEURO_DETAILED_ITEMS,
  ANXIETY_INDUCING_MEDS,
} from '../domain/visit-status'
import { phq4Subscores, phq4RecommendedScaleKeys } from '../domain/phq4'
import { exportVisitJson, exportVisitPdf, exportVisitEmail, type VisitExportData } from '../services/visit-export'
import {
  TREATMENT_STAGE_LABELS,
  DRUG_INFO,
  DOSE_RANGES,
  TREATMENT_DRUGS,
  NON_DRUG_THERAPY,
  BASE_EXAM_STUDIES,
  CONDITIONAL_EXAM_STUDIES,
  EFFECT_LABELS,
  nextTreatmentStage,
  CONSULTATION_SPECIALTIES,
  type DrugInfo,
} from '../domain/treatment'

// ===== Сохранение размеров текстовых полей (textarea) между сессиями =====
// Размеры хранятся в localStorage по ключу из v-persist-size="'<id>'"
function loadTextareaSizes(): Record<string, { w: number; h: number }> {
  return loadFromStorage<Record<string, { w: number; h: number }>>(STORAGE_KEYS.textareaSizes, {})
}

function saveTextareaSize(key: string, el: HTMLTextAreaElement): void {
  const sizes = loadTextareaSizes()
  sizes[key] = { w: el.clientWidth, h: el.clientHeight }
  localStorage.setItem(STORAGE_KEYS.textareaSizes, JSON.stringify(sizes))
}

// Директива v-persist-size="'complaints'": восстанавливает размер после рендера, сохраняет при resize
const vPersistSize = {
  mounted(el: HTMLTextAreaElement, binding: { value: string }) {
    const key = binding.value
    if (!key) return
    const saved = loadTextareaSizes()[key]
    if (saved) {
      requestAnimationFrame(() => {
        if (saved.w > 0) el.style.width = saved.w + 'px'
        if (saved.h > 0) el.style.height = saved.h + 'px'
      })
    }
    // Фиксация размера пользовательского resize (мышь / тач)
    const persist = () => saveTextareaSize(key, el)
    el.addEventListener('mouseup', persist)
    el.addEventListener('touchend', persist)
  },
}

const route = useRoute()
const router = useRouter()

const patients = computed<User[]>(() => users.filter((u) => u.role === 'patient'))
// Пациент определяется маршрутом: /doctor/patient/:id/visit/(new|:visitId)
const selectedId = computed<number>(() => Number(route.params.id))
const selected = computed<User | undefined>(() => patients.value.find((p) => p.id === selectedId.value))

// ===== Режимы страницы =====
// /doctor/patient/:id/visit/new       — новый приём (редактирование)
// /doctor/patient/:id/visit/:visitId  — просмотр сохранённого приёма (readonly + повторный экспорт)
const readOnly = computed(() => route.name === 'doctor-visit')

// Просматриваемая запись (ищется в истории приёмов пациента)
function storedVisit(): Visit | undefined {
  if (!readOnly.value) return undefined
  const wantId = String(route.params.visitId || '')
  return getPatient(selectedId.value).visits.find((v) => String(v.id) === wantId)
}

// Timestamp даты-времени приёма из поля формы (бейдж в readonly, экспорт)
const visitTs = computed(() => dateTimeLocalToTs(visit.date))

// Загрузка сохранённого приёма в реактивную форму (для просмотра/экспорта).
// В readonly поля недоступны (fieldset disabled) — только отображение.
// Дозировка авиандра — из справочника препаратов (DRUG_INFO, domain/treatment.ts),
// а не захардкожена в шаблоне
const aviandrDose = computed<string>(() => (DRUG_INFO['Авиандр']?.['Дозировка'] || []).join('; '))

function applyStoredVisit(v: Visit): void {
  visit.date = tsToDateTimeLocal(v.date)
  visit.condition = v.condition
  visit.notes = v.notes
  visit.complaints = v.complaints || ''
  visit.criteria = [...(v.criteria || [])]
  visit.anamnesis = v.anamnesis || ''
  visit.anamnesisFactors = [...(v.anamnesisFactors || [])]
  visit.symptomDuration = v.symptomDuration || ''
  visit.chronicConditions = v.chronicConditions || ''
  visit.allergies = v.allergies || ''
  visit.currentMeds = v.currentMeds || ''
  visit.lifeFactors = [...(v.lifeFactors || [])]
  visit.surgeriesTraumas = v.surgeriesTraumas || ''
  visit.transfusions = !!v.transfusions
  visit.transfusionsDetails = v.transfusionsDetails || ''
  Object.assign(visit.generalStatus, v.generalStatus || {})
  Object.assign(visit.neuroQuick, v.neuroQuick || {})
  Object.assign(visit.neuroDetailed, v.neuroDetailed || {})
  visit.diagnosis = v.diagnosis || ''
  visit.diagnosisCode = v.diagnosisCode || ''
  visit.diagnosisReason = v.diagnosisReason || ''
  visit.treatmentStage = v.treatmentStage || 'monotherapy'
  visit.treatmentDrug = v.treatmentDrug || ''
  visit.treatmentDose = v.treatmentDose || ''
  visit.treatmentNote = v.treatmentNote || ''
  visit.treatmentStartDate = v.treatmentStartDate || 0
  visit.treatmentWeeks = v.treatmentWeeks ?? 0
  visit.treatmentEffect = v.treatmentEffect || ''
  visit.treatmentHistory = (v.treatmentHistory || []).map((c) => ({ ...c }))
  visit.examStudies = [...(v.examStudies || [])]
  Object.assign(visit.examFlags, { paroxysmal: false, vascular: false, organic: false, ...(v.examFlags || {}) })
  visit.nonDrugTherapy = [...(v.nonDrugTherapy || [])]
  visit.consultSpecialties = [...(v.consultSpecialties || [])]
  visit.consultOther = v.consultOther || ''
  visit.prescribeAviandr = !!v.prescribeAviandr
}

interface VisitForm {
  // Значение <input type="datetime-local"> ('YYYY-MM-DDTHH:mm'); при сохранении
  // переводится в timestamp (см. dateTimeLocalToTs)
  date: string
  condition: Condition | ''
  notes: string
  complaints: string
  criteria: string[]
  anamnesis: string
  anamnesisFactors: string[]
  symptomDuration: string
  chronicConditions: string
  allergies: string
  currentMeds: string
  lifeFactors: string[]
  surgeriesTraumas: string
  transfusions: boolean
  transfusionsDetails: string
  generalStatus: Record<string, string>
  neuroQuick: Record<string, string>
  neuroDetailed: Record<string, string>
  diagnosis: string
  diagnosisCode: string
  diagnosisReason: string
  // Лечение ГТР (итеративный курс; НЕ сбрасывается при сохранении приёма)
  treatmentStage: string
  treatmentDrug: string
  treatmentDose: string
  treatmentNote: string
  treatmentStartDate: number
  treatmentWeeks: number
  treatmentEffect: string
  treatmentHistory: TreatmentCycle[]
  // Дообследование
  examStudies: string[]
  examFlags: Record<string, boolean>
  // Немедикаментозная терапия
  nonDrugTherapy: string[]
  // Консультации специалистов (ключи из CONSULTATION_SPECIALTIES + текст «другое»)
  consultSpecialties: string[]
  consultOther: string
  // Назначение авиандра: чекбокс; дозировка — из справочника DRUG_INFO
  prescribeAviandr: boolean
}

const visit = reactive<VisitForm>({
  date: tsToDateTimeLocal(nowTs()),
  condition: 'Без изменений',
  notes: '',
  complaints: '',
  criteria: [],
  anamnesis: '',
  anamnesisFactors: [],
  symptomDuration: '',
  chronicConditions: '',
  allergies: '',
  currentMeds: '',
  lifeFactors: [],
  surgeriesTraumas: '',
  transfusions: false,
  transfusionsDetails: '',
  generalStatus: {
    condition: 'satisfactory',
    consciousness: 'clear',
    position: 'active',
    behavior: 'adequate',
    bp: '',
    skin: 'normal',
  },
  neuroQuick: {
    pupils: 'equal',
    speech: 'normal',
    gait: 'steady',
  },
  neuroDetailed: {
    meningeal: 'negative',
    cranial_nerves: '',
    pupils_react: 'normal',
    nystagmus: 'none',
    limb_strength: '5',
    tone: 'normal',
    reflexes: 'normal',
    pathological_reflexes: 'none',
    sensation: '',
    romberg: 'steady',
    finger_nose: 'normal',
    cognition: '',
  },
  diagnosis: '',
  diagnosisCode: '',
  diagnosisReason: '',
  treatmentStage: 'monotherapy',
  treatmentDrug: '',
  treatmentDose: '',
  treatmentNote: '',
  treatmentStartDate: 0,
  treatmentWeeks: 0,
  treatmentEffect: '',
  treatmentHistory: [],
  examStudies: [],
  examFlags: { paroxysmal: false, vascular: false, organic: false },
  nonDrugTherapy: [],
  consultSpecialties: [],
  consultOther: '',
  prescribeAviandr: false,
})

// При переходе к просмотру сохранённого приёма — загружаем его в форму (readonly).
// immediate: срабатывает и при первом открытии страницы просмотра.
watch(
  () => [route.params.id, route.params.visitId] as const,
  () => {
    const v = storedVisit()
    if (v) applyStoredVisit(v)
  },
  { immediate: true }
)

// Разделение групп анамнеза на «заболевание» и «жизнь»
const illnessAnamnesis = computed(() => ANAMNESIS_GROUPS.filter((g) => g.title === 'Анамнез заболевания'))
const lifeAnamnesis = computed(() => ANAMNESIS_GROUPS.filter((g) => g.title !== 'Анамнез заболевания'))

// Автопростановка чекбоксов соматических заболеваний по свободному тексту
// хронических заболеваний. Сканирование при каждом изменении текста:
// слово появилось — галочка ставится, слово удалено — снята.
// Минимальная длина ключевого слова — 3 символа (защита от случайных совпадений).
const MIN_KEYWORD_LEN = 3
// Значения, поставленные автоматически: только их снимаем при исчезновении слова.
// Вручную отмеченные врачом галочки не трогаем.
const autoAdded = new Set<string>()
const autoAddedIllness = new Set<string>()

// Общая логика автопростановки/снятия галочек по ключевым словам текста
function syncFactorsByText(
  text: string,
  factors: string[],
  groups: { items: AnamnesisFactorDef[] }[],
  autoSet: Set<string>
): void {
  const low = text.toLowerCase()
  for (const group of groups) {
    for (const f of group.items) {
      if (!f.keywords || !f.keywords.length) continue
      const kws = f.keywords.filter((kw) => kw.length >= MIN_KEYWORD_LEN)
      if (!kws.length) continue
      const match = kws.some((kw) => low.includes(kw))
      const idx = factors.indexOf(f.value)
      if (match && idx === -1) {
        factors.push(f.value)
        autoSet.add(f.value)
      } else if (!match && idx !== -1 && autoSet.has(f.value)) {
        factors.splice(idx, 1)
        autoSet.delete(f.value)
      }
    }
  }
}

// Анамнез жизни: хронические заболевания → соматические чекбоксы
watch(
  () => visit.chronicConditions,
  (text) => syncFactorsByText(text, visit.lifeFactors, lifeAnamnesis.value, autoAdded)
)

// Если врач вручную снял автопоставленную галочку — исключаем её из
// автоуправляемых, чтобы повторный ввод текста не «боролся» с врачом
watch(
  () => visit.lifeFactors,
  (factors) => {
    for (const v of Array.from(autoAdded)) {
      if (!factors.includes(v)) autoAdded.delete(v)
    }
  }
)

// Анамнез заболевания: стресс/ПАВ/COVID/синкопы в тексте → чекбоксы факторов
watch(
  () => visit.anamnesis,
  (text) => syncFactorsByText(text, visit.anamnesisFactors, illnessAnamnesis.value, autoAddedIllness)
)

watch(
  () => visit.anamnesisFactors,
  (factors) => {
    for (const v of Array.from(autoAddedIllness)) {
      if (!factors.includes(v)) autoAddedIllness.delete(v)
    }
  }
)

// ===== Общий статус (осмотр) =====
// STATUS_ITEMS и типы — в src/domain/visit-status.ts

// Предупреждение по пункту статуса: для select — из описания опции,
// для АД — вычисляется по числовым порогам
function statusWarning(f: StatusItem): string {
  const v = visit.generalStatus[f.value] || ''
  if (f.type === 'bp') return bpWarning(v)
  const opt = (f.options || []).find((o) => o.value === v && v !== '')
  return opt?.warning || ''
}

// Анализ АД: норма < 140/90; гипертензия ≥ 140 и/или ≥ 90; гипотензия < 90 сист.
function bpWarning(v: string): string {
  const m = v.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (!m) return ''
  const sys = Number(m[1])
  const dia = Number(m[2])
  if (sys >= 180 || dia >= 110) return 'Кризовое АД: экстренная гипотензивная терапия, исключить поражение органов-мишеней'
  if (sys >= 140 || dia >= 90) return 'АД повышено: контроль АД, согласовать терапию с терапевтом/кардиологом; СИОЗС и НПВС могут повышать АД'
  if (sys < 90) return 'АД снижено: исключить ортостатическую гипотензию, передозировку седативных/гипотензивных'
  return ''
}

// Универсальное предупреждение по пункту статуса (используется общим,
// кратким и развёрнутым неврологическим статусами)
function statusWarningGeneric(f: StatusItem, source: Record<string, string>): string {
  const v = source[f.value] || ''
  if (f.type === 'bp') return bpWarning(v)
  const opt = (f.options || []).find((o) => o.value === v && v !== '')
  return opt?.warning || ''
}

// ===== Неврологический статус =====
// NEURO_QUICK_ITEMS / NEURO_DETAILED_ITEMS — в src/domain/visit-status.ts

// Счётчик отклонений в развёрнутом статусе для бейджа сворачиваемого блока
const neuroDetailedWarnCount = computed(
  () => NEURO_DETAILED_ITEMS.filter((f) => statusWarningGeneric(f, visit.neuroDetailed)).length
)

// ===== PHQ-4: состояние и сохранение (UI — components/Phq4Questionnaire.vue) =====
const phq4Answers = ref<number[]>(new Array(4).fill(-1))
const phq4Saved = ref(false)

// Производные величины подшкал — из чистой логики domain/phq4.ts
const phq4Sub = computed(() => phq4Subscores(phq4Answers.value))
const phq4Complete = computed(() => phq4Sub.value.answered === 4)
const phq4Anxiety = computed(() => phq4Sub.value.anxiety)
const phq4Depression = computed(() => phq4Sub.value.depression)
const phq4NoAnxietyDepression = computed(() => phq4Complete.value && phq4Anxiety.value < 3 && phq4Depression.value < 3)
// Соматические жалобы из пунктов ГТР: группа B (вегетативные симптомы, B1–B14)
const phq4SomaticCriteria = computed(
  () => visit.criteria.some((c) => /^B([1-9]|1[0-4])$/.test(c))
)
// Нарушение сна в жалобах (свободное текстовое поле)
const phq4SleepComplaint = computed(() => {
  const low = visit.complaints.toLowerCase()
  // отдельное слово «сон» в любом падеже + производные
  return /(^|[^а-яё])сон/.test(low) || ['сна', 'засып', 'бессонн', 'инсомн', 'просыпа'].some((kw) => low.includes(kw))
})

function savePHQ4(): void {
  if (!selectedId.value || !phq4Complete.value || phq4Saved.value) return
  syncTest(selectedId.value, {
    type: 'PHQ4',
    score: phq4Anxiety.value + phq4Depression.value,
    date: todayDateTs(),
  })
  phq4Saved.value = true
}

// ===== Выбор шкалы: перечень без PHQ4 (он — отдельный блок), подсветка рекомендованных =====
// Шкалы в меню выпадающего списка — PHQ4 исключён (проходит отдельным блоком выше)
const scaleOptions = computed(() => Object.values(SCALES).filter((s) => s.key !== 'PHQ4'))
// Ключи шкал, рекомендованных по результатам PHQ-4 — чистая логика в domain/phq4.ts
const recommendedScaleKeys = computed<Set<string>>(() =>
  phq4RecommendedScaleKeys({
    complete: phq4Complete.value,
    anxiety: phq4Anxiety.value,
    depression: phq4Depression.value,
    sleepComplaint: phq4SleepComplaint.value,
    somaticCriteria: phq4SomaticCriteria.value,
  })
)
// Шкала рекомендована, если ещё не пройдена в текущем приёме (сегодня).
// Исторические результаты прошлых дат не гасят подсветку — шкалы проходят на каждом приёме.
function isScaleRecommended(key: string): boolean {
  if (!recommendedScaleKeys.value.has(key)) return false
  const scale = SCALES[key]
  const today = todayDateTs()
  return !scale.results.some((r) =>
    (selectedTests.value || []).some((t) => t.type === r.type && t.date === today)
  )
}

// Человекочитаемый перечень рекомендованных шкал для предупреждения
// в разделе «Прохождение шкал» (только ещё не пройденные)
interface RecommendedScaleInfo {
  title: string
  reason: string
}
const recommendedScaleTitles = computed<RecommendedScaleInfo[]>(() => {
  const reasons: Record<string, string> = {
    HADS: 'соматические жалобы из пунктов ГТР или одинаково выраженные тревога и депрессия (HADS оценивает обе подшкалы, не завышая баллы при соматической патологии)',
    GAD7: 'преобладание тревоги в PHQ-4 (оценка тяжести генерализованной тревоги)',
    PHQ9: 'преобладание депрессии в PHQ-4 (оценка тяжести депрессивного эпизода)',
    ISI: 'жалобы на нарушение сна (индекс тяжести инсомнии)',
  }
  return scaleOptions.value
    .filter((s) => isScaleRecommended(s.key))
    .map((s) => ({ title: s.title, reason: reasons[s.key] || 'по результатам PHQ-4' }))
})

// ===== Диагноз: коды МКБ-10 для выбора =====
interface Icd10Code {
  code: string
  title: string
}
const ICD10_CODES: Icd10Code[] = [
  { code: 'F32.0', title: 'Депрессивный эпизод лёгкой степени' },
  { code: 'F32.1', title: 'Депрессивный эпизод умеренной степени' },
  { code: 'F32.2', title: 'Депрессивный эпизод тяжёлой степени без психотических симптомов' },
  { code: 'F33.0', title: 'Рекуррентное депрессивное расстройство, текущий эпизод лёгкой степени' },
  { code: 'F33.1', title: 'Рекуррентное депрессивное расстройство, текущий эпизод умеренной степени' },
  { code: 'F33.2', title: 'Рекуррентное депрессивное расстройство, текущий эпизод тяжёлой степени' },
  { code: 'F41.1', title: 'Генерализованное тревожное расстройство' },
  { code: 'F41.0', title: 'Паническое расстройство' },
  { code: 'F41.2', title: 'Смешанное тревожно-депрессивное расстройство' },
  { code: 'F40.1', title: 'Социальные фобии' },
  { code: 'F42.0', title: 'Обсессивно-компульсивное расстройство' },
  { code: 'F45.0', title: 'Ипохондрическое расстройство' },
  { code: 'F51.0', title: 'Бессонница неорганической этиологии' },
  { code: 'Z00.0', title: 'Общее медицинское обследование' },
]

// ===== Диагноз: сопоставление клиники с введённым диагнозом =====
// Текст для анализа берётся ИЗ КОДА и ИЗ ФОРМУЛИРОВКИ
const diagnosisText = computed(() => ((visit.diagnosisCode || '').trim() + ' ' + (visit.diagnosis || '').trim()).trim().toLowerCase())
// Признаки ГТР в диагнозе (текст или код МКБ-10)
const diagnosisIsGAD = computed(
  () => /гтр|генерализованн.*тревожн|f41[.]1|смешанн.*тревожн.*депресс/.test(diagnosisText.value)
)
// Признаки депрессии в диагнозе
const diagnosisIsDepression = computed(
  () => /депресс|f3[23][.]/.test(diagnosisText.value)
)
// Астенические синдромы — описательные формулировки непсихиатрического профиля
// (невролог/интернист не выставляют шифр F: тревога «зашифрована» как синдром)
const diagnosisIsAsthenicVegetative = computed(
  () => /астено[- ]?вегетативн/.test(diagnosisText.value)
)
const diagnosisIsAsthenicDepressive = computed(
  () => /астено[- ]?депрессивн/.test(diagnosisText.value)
)
// Постковидная астения / астения как самостоятельная формулировка
const diagnosisIsAsthenia = computed(
  () => /постковидн.*астени|(^|[^а-яё])астени/.test(diagnosisText.value)
)
// В формулировке есть шифр F (психические расстройства) — его вправе выставлять только психиатр
const diagnosisHasFCode = computed(
  () => /(^|\s)f\d{2}[.\s]/.test(diagnosisText.value)
)

// Клинические свидетельства ГТР по данным приёма (алгоритм диагностики ГТР):
// - группа A критериев (нефабулируемая тревога) ≥ 1 пункт
// - группа B (вегетативные симптомы) ≥ 4 пунктов, минимум один из перечня 1–4 (B1–B4)
// - длительность симптомов более 6 месяцев
// - не отмечены группы C (дифдиагноз) и D (критерии исключения)
// - GAD-7 ≥ 10 или HADS-A ≥ 11 (клинически выражено) сегодня
function gadGroupCount(code: string): number {
  const group = GAD_CRITERIA.find((g) => g.code === code)
  return group ? groupCriteria(group) : 0
}
// Есть ли среди отмечённых симптомов группы B хотя бы один из пунктов 1–4
// (сердцебиение, потливость, тремор, сухость во рту — обязательные вегетативные)
const bVegCount = computed(() => ['B1', 'B2', 'B3', 'B4'].filter((c) => visit.criteria.includes(c)).length)
// Отмечены ли группы C (иная психическая патология) и D (соматика/ПАВ/органика)
const cGroupCount = computed(() => gadGroupCount('C'))
const dGroupCount = computed(() => gadGroupCount('D'))
// Длительность симптомов — критерий > 6 месяцев для ГТР
const durationOk = computed(() => visit.symptomDuration === 'more_6m')
const gadClinical = computed(() => {
  const today = todayDateTs()
  const hasTodayGad = (testsByType.value.GAD7 || []).some((t) => t.score >= 10 && t.date === today)
  const hasTodayHadsA = (testsByType.value.HADS_A || []).some((t) => t.score >= 11 && t.date === today)
  return (
    gadGroupCount('A') >= 1 &&
    gadGroupCount('B') >= 4 &&
    bVegCount.value >= 1 &&
    durationOk.value &&
    cGroupCount.value === 0 &&
    dGroupCount.value === 0 &&
    (hasTodayGad || hasTodayHadsA)
  )
})

// ===== Пошаговый алгоритм диагностики ГТР (дерево решений) =====
// Возвращает шаги с результатом; на первом непройденном шаге алгоритм «выходит»
interface GadStepInfo {
  step: string
  title: string
  detail: string
  ok: boolean | null // null — шаг не проверяется (алгоритм вышел раньше)
}
const gadSteps = computed<GadStepInfo[]>((): GadStepInfo[] => {
  const today = todayDateTs()
  const hasTodayGad = (testsByType.value.GAD7 || []).some((t) => t.score >= 10 && t.date === today)
  const hasTodayHadsA = (testsByType.value.HADS_A || []).some((t) => t.score >= 11 && t.date === today)
  const aCount = gadGroupCount('A')
  const bCount = gadGroupCount('B')
  const steps: GadStepInfo[] = []
  let exited = false
  const push = (step: string, title: string, ok: boolean, detailOk: string, detailFail: string) => {
    steps.push(
      exited
        ? { step, title, ok: null, detail: 'алгоритм вышел раньше — шаг не проверяется' }
        : { step, title, ok, detail: ok ? detailOk : detailFail }
    )
    if (!ok) exited = true
  }

  push(
    'Шаг 2',
    'Устойчивая диффузная тревога, напряжение',
    aCount >= 1,
    `группа A: отмечено ${aCount} из 5 (тревога, напряжение, гипервигилитет…)`,
    'нет жалоб из группы A — перейти к клиническим рекомендациям по текущему состоянию (выход из алгоритма)'
  )
  push(
    'Шаг 3',
    'Вегетативные симптомы',
    bVegCount.value >= 1,
    `сердцебиение/потливость/тремор/сухость во рту: отмечено ${bVegCount.value} из 4`,
    'нет вегетативных симптомов из пунктов 1–4 — перейти к клиническим рекомендациям (выход)'
  )
  push(
    'Шаг 4',
    'Длительность жалоб более 6 месяцев',
    durationOk.value,
    'длительность симптомов: более 6 месяцев',
    visit.symptomDuration === ''
      ? 'длительность не указана — заполните поле «Длительность симптомов» в анамнезе заболевания; при < 6 мес исключить иную психическую патологию (группа C)'
      : 'симптомы менее 6 месяцев — исключить иную психическую патологию (группа C дифдиагноза), затем соматическую'
  )
  push(
    'Шаг 5',
    'Соматическая и иная патология исключена',
    cGroupCount.value === 0 && dGroupCount.value === 0,
    'группы C и D не отмечены — дифдиагноз и критерии исключения чистые',
    `отмечено: группа C ${cGroupCount.value} (иная психическая патология), группа D ${dGroupCount.value} (соматика/органика/ПАВ)` +
      (dGroupCount.value > 0 ? ' — рассмотреть коморбидность соматической патологии и ГТР, перейти к клиническим рекомендациям' : ' — перейти к клиническим рекомендациям')
  )
  push(
    'Шаг 6',
    'Критерии МКБ-10 для ГТР + шкалы',
    aCount >= 1 && bCount >= 4 && bVegCount.value >= 1 && (hasTodayGad || hasTodayHadsA),
    `группа A ≥ 1 (${aCount}), группа B ≥ 4 (${bCount}, из пунктов 1–4: ${bVegCount.value}), тревога по шкалам сегодня: ${hasTodayGad ? 'GAD-7 ≥ 10' : 'HADS-A ≥ 11'}`,
    `требуется: группа A ≥ 1 (сейчас ${aCount}), группа B ≥ 4 (сейчас ${bCount}), из пунктов 1–4 хотя бы один (сейчас ${bVegCount.value}), клинически значимая тревога сегодня (GAD-7 ≥ 10 / HADS-A ≥ 11)`
  )
  return steps
})

// Клинические свидетельства депрессии: PHQ-9 ≥ 10 или HADS-D ≥ 11 сегодня
const depressionClinical = computed(() => {
  const today = todayDateTs()
  const hasTodayPhq9 = (testsByType.value.PHQ9 || []).some((t) => t.score >= 10 && t.date === today)
  const hasTodayHadsD = (testsByType.value.HADS_D || []).some((t) => t.score >= 11 && t.date === today)
  return hasTodayPhq9 || hasTodayHadsD
})

interface DiagnosisMatchInfo {
  title: string
  detail: string
  match: boolean
}
// Сопоставление: ГТР в диагнозе ↔ клиника ГТР; депрессия в диагнозе ↔ клиника депрессии;
// астенические синдромы — «замаскированные» эквиваленты тревоги/депрессии у невролога
const diagnosisMatch = computed<DiagnosisMatchInfo[]>(() => {
  if (!diagnosisText.value) return []
  const out: DiagnosisMatchInfo[] = []
  if (diagnosisHasFCode.value) {
    out.push({
      title: 'Шифр F (МКБ-10)',
      detail: 'рубрики F (психические расстройства) вправе выставлять только врач-психиатр; невролог/интернист используют описательные формулировки (астено-вегетативный, астено-депрессивный синдром)',
      match: false,
    })
  }
  if (diagnosisIsGAD.value) {
    out.push(
      gadClinical.value
        ? { title: 'Клиника соответствует ГТР', detail: 'группа A ≥ 1, группа B ≥ 4 симптомов, тревога по шкалам за сегодня клинически значима', match: true }
        : { title: 'Клиника НЕ соответствует ГТР', detail: 'требуется: группа A ≥ 1 (сейчас ' + gadGroupCount('A') + '), группа B ≥ 4 (сейчас ' + gadGroupCount('B') + ') с минимум одним из пунктов 1–4 (сейчас ' + bVegCount + '), длительность > 6 мес, группы C/D не отмечены, клинически значимая тревога сегодня (GAD-7 ≥ 10 / HADS-A ≥ 11) — см. алгоритм выше', match: false }
    )
  }
  if (diagnosisIsDepression.value) {
    out.push(
      depressionClinical.value
        ? { title: 'Клиника соответствует депрессии', detail: 'PHQ-9 ≥ 10 или HADS-D ≥ 11 по результатам сегодняшнего приёма', match: true }
        : { title: 'Клиника НЕ соответствует депрессии', detail: 'нет клинически значимой депрессии по шкалам сегодня (PHQ-9 ≥ 10 / HADS-D ≥ 11) — проверьте обоснованность диагноза или дообследуйте', match: false }
    )
  }
  if (!diagnosisIsGAD.value && !diagnosisIsDepression.value && (diagnosisIsAsthenicVegetative.value || diagnosisIsAsthenicDepressive.value || diagnosisIsAsthenia.value)) {
    out.push({
      title: diagnosisIsAsthenicVegetative.value
        ? 'Астено-вегетативный синдром'
        : diagnosisIsAsthenicDepressive.value
          ? 'Астено-депрессивный синдром'
          : /постковидн/.test(diagnosisText.value) ? 'Постковидная астения' : 'Астения',
      detail: (diagnosisIsAsthenicVegetative.value
        ? 'формулировка невролога/интерниста — расценивается как тревожный эквивалент'
        : diagnosisIsAsthenicDepressive.value
          ? 'формулировка невролога/интерниста — расценивается как смешанный тревожно-депрессивный эквивалент'
          : 'астеническая формулировка — возможен тревожный/депрессивный эквивалент, требуется клиническая корреляция') +
        (gadClinical.value || depressionClinical.value
          ? '; клинические данные соответствуют — при подозрении на ГТР/депрессию направить на консультацию психиатра для верификации шифра'
          : '; выраженных клинических признаков по данным приёма не выявлено — наблюдение, повторный скрининг'),
      match: true,
    })
  }
  if (!diagnosisIsGAD.value && !diagnosisIsDepression.value && !diagnosisIsAsthenicVegetative.value && !diagnosisIsAsthenicDepressive.value && !diagnosisIsAsthenia.value && /тревог|тревожн|депресс/.test(diagnosisText.value)) {
    out.push({ title: 'Уточните формулировку', detail: 'диагноз упоминает тревогу/депрессию, но рубрика (ГТР / депрессивный эпизод) не распознана — сверьте с МКБ-10', match: false })
  }
  return out
})

// Сводка сегодняшних результатов шкал для дефолтного уведомления в блоке диагноза
const todayScaleResults = computed<string[]>(() => {
  const today = todayDateTs()
  const out: string[] = []
  for (const [type, def] of Object.entries(TEST_TYPES)) {
    const last = (testsByType.value[type] || []).find((t) => t.date === today)
    if (last) out.push(`${def.name} ${last.score}/${def.max}`)
  }
  return out
})

// Лекарственно-индуцированная тревога: список препаратов — в domain/visit-status.ts (ANXIETY_INDUCING_MEDS)

const medInducedWarning = computed<string | null>(() => {
  if (!visit.currentMeds.trim()) return null
  const text = visit.currentMeds.toLowerCase()
  const found = ANXIETY_INDUCING_MEDS.filter((m) => text.includes(m))
  if (!found.length) return null
  return 'Возможна лекарственно-индуцированная тревога: один из принимаемых препаратов (кортикостероиды, тиреоидные, бронхолитики и др.) может вызывать или усиливать тревожную симптоматику. Оценить соотношение пользы и риска, рассмотреть коррекцию дозы или замену совместно с назначившим врачом.'
})

// ---------- Прохождение шкал ----------
const scaleKey = ref('PHQ9')
const activeScaleKey = ref('')

// Режим блока «Тестирование»: '' — выбор способа, 'interactive' — прохождение шкалы, 'manual' — ручной ввод
const testMode = ref<'' | 'interactive' | 'manual'>('')
function setTestMode(m: '' | 'interactive' | 'manual') {
  if (testMode.value === m) {
    // Повторный клик по активной кнопке — скрыть форму (кроме случая уже начатой шкалы)
    if (m !== 'interactive' || !activeScaleKey.value) testMode.value = ''
    else testMode.value = m
  } else {
    testMode.value = m
    // При переключении на ручной ввод скрываем начатое прохождение шкалы
    if (m === 'manual') {
      activeScaleKey.value = ''
      scaleAnswers.value = []
      successMsgScale.value = ''
    }
  }
}
const scaleAnswers = ref<number[]>([])
const successMsgScale = ref('')

const activeScale = computed(() => SCALES[activeScaleKey.value] || null)
const answered = computed(() => scaleAnswers.value.filter((v) => v >= 0).length)
const scaleComplete = computed(
  () => !!activeScale.value && answered.value === activeScale.value.questions.length
)

function startScale(): void {
  activeScaleKey.value = scaleKey.value
  scaleAnswers.value = new Array(SCALES[scaleKey.value].questions.length).fill(-1)
  successMsgScale.value = ''
}

function saveScale(): void {
  if (!selectedId.value || !activeScale.value || !scaleComplete.value) return
  for (const r of activeScale.value.results) {
    syncTest(selectedId.value, { type: r.type, score: r.pick(scaleAnswers.value) })
  }
  successMsgScale.value = 'Результаты сохранены ✓'
  activeScaleKey.value = ''
}
const test = reactive<{ type: TestType; score: number; date: string }>({
  type: 'PHQ9',
  score: 0,
  // Значение <input type="date"> ('YYYY-MM-DD'); при сохранении — dateStrToTs
  date: '',
})

const successMsg = ref('')
const successMsgTest = ref('')

// Сколько пунктов данной группы ГТР отмечено (нумерация «A1», «B5»…)
function groupCriteria(group: { code: string; items: string[] }): number {
  return visit.criteria.filter((c) => c.startsWith(group.code)).length
}

// Все тесты выбранного пациента (реактивно из store)
const selectedTests = computed(() => getPatient(selectedId.value ?? -1).tests)

// Группировка результатов по типу теста — для графиков
const testsByType = computed<Record<string, { date: number; score: number; id: number }[]>>(() => {
  const map: Record<string, { date: number; score: number; id: number }[]> = {}
  for (const r of selectedTests.value) {
    ;(map[r.type] ||= []).push({ date: r.date, score: r.score, id: r.id })
  }
  return map
})

// HADS: две серии (тревога и депрессия) на общем графике — единый построитель
const hasHads = computed(() => (testsByType.value.HADS_A || []).length > 0 || (testsByType.value.HADS_D || []).length > 0)
const hadsSeries = computed(() => hadsSeriesOf(testsByType.value))
const hadsTable = computed(() => hadsTableOf(testsByType.value))

// ---------- Хелперы для бейджей ----------
// Локальные обёртки над общим модулем chart-helpers (общий для врача и пациента)
const T = () => testsByType.value
function lastScore(type: string): number {
  return lastScoreOf(T(), type)
}
function lastOf(type: string): string {
  return lastOfIn(T(), type)
}
function trend(type: string): number {
  return trendOf(T(), type)
}
function interpret(type: string, score: number): string {
  return interpretScore(type, score)
}
function alertClass(type: string, score: number): string {
  return alertClassOf(T(), type, score)
}

// Предупреждения о значимых изменениях — общий построитель
const significantWarnings = computed<string[]>(() => buildSignificantWarnings(testsByType.value))

// ===== Лечение ГТР: итеративный алгоритм подбора терапии =====
// Автомат состояний и справочники — в src/domain/treatment.ts
// (TREATMENT_STAGE_LABELS, ANTIDEPRESSANTS, DRUG_INFO, DOSE_RANGES,
//  TREATMENT_DRUGS, nextTreatmentStage).

// Черновой выбор препарата для назначения (не переключает «Шаг А» до подтверждения)
const treatmentDrugDraft = ref('')
// Справочная карточка по черновому выбору препарата (по первому слову названия)
const draftDrugInfo = computed<DrugInfo | null>(() => {
  const key = (treatmentDrugDraft.value || '').split(' ')[0]
  return key ? DRUG_INFO[key] || null : null
})
// Справочная карточка по уже назначенному препарату
const assignedDrugInfo = computed<DrugInfo | null>(() => {
  const key = (visit.treatmentDrug || '').split(' ')[0]
  return key ? DRUG_INFO[key] || null : null
})

// ===== Сопоставление противопоказаний препарата с данными анамнеза =====
// Источники: чекбоксы анамнеза жизни/заболевания + свободный текст полей
// «Хронические заболевания» и «Принимаемые препараты» (по ключевым словам).
interface ContraMatchRule {
  // Фрагменты текста, которые ищем в строке противопоказаний препарата
  fragments: string[]
  // Чем подтверждается у пациента (для текста предупреждения)
  label: string
  check: () => boolean
}
const PATIENT_CONTRA_RULES: ContraMatchRule[] = [
  {
    fragments: ['беременность'],
    label: 'беременность (отмечена в анамнезе жизни)',
    check: () => visit.lifeFactors.includes('gyn_pregnancy'),
  },
  {
    fragments: ['лактация'],
    label: 'лактация (отмечена в анамнезе жизни)',
    check: () => visit.lifeFactors.includes('gyn_lactation'),
  },
  {
    fragments: ['пав'],
    label: 'употребление ПАВ (отмечено в анамнезе заболевания)',
    check: () => visit.anamnesisFactors.includes('substance'),
  },
  {
    fragments: ['гипертензия'],
    label: 'гипертоническая болезнь (анамнез жизни)',
    check: () => visit.lifeFactors.includes('hypertension') || /гипертон|давление повышен/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['глаукома'],
    label: 'глаукома (хронические заболевания)',
    check: () => /глауком/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['печёночн', 'печеночн'],
    label: 'патология печени (хронические заболевания)',
    check: () => /печён|печен|цирроз|гепатит/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['почечн'],
    label: 'патология почек (хронические заболевания)',
    check: () => /почечн|хпн|нефрит/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['инфаркт'],
    label: 'инфаркт миокарда в анамнезе (хронические заболевания)',
    check: () => /инфаркт/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['мочеиспускания'],
    label: 'задержка мочеиспускания / аденома простаты (хронические заболевания)',
    check: () => /мочеиспускан|аденом|простат/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['проводимости'],
    label: 'нарушения сердечной проводимости / аритмии (хронические заболевания)',
    check: () => /аритми|блокад|проводимости/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['qt'],
    label: 'удлинение интервала QT (хронические заболевания)',
    check: () => /\bqt\b|удлинени\s*qt/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['эпилепс'],
    label: 'эпилепсия (анамнез жизни / хронические заболевания)',
    check: () => visit.lifeFactors.includes('epilepsy') || /эпилепс/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['органическ', 'поражени головного мозга'],
    label: 'органическое поражение головного мозга, ЧМТ в анамнезе (анамнез жизни / хронические заболевания)',
    check: () =>
      visit.lifeFactors.includes('tbi') ||
      visit.examFlags.organic ||
      /опухол|киста головного мозга|органическ.*головного|последствия чмт|энцефал/.test(visit.chronicConditions.toLowerCase()),
  },
  {
    fragments: ['мао'],
    label: 'приём ингибиторов МАО (принимаемые препараты)',
    check: () => /мао/.test(visit.currentMeds.toLowerCase()),
  },
  {
    fragments: ['флувоксамина', 'ципрофлоксацина'],
    label: 'приём флувоксамина / ципрофлоксацина (принимаемые препараты)',
    check: () => /флувоксамин|ципрофлоксацин/.test(visit.currentMeds.toLowerCase()),
  },
]

// Проверка препарата: какие его противопоказания подтверждены данными анамнеза
function contraWarningsFor(info: DrugInfo | null): string[] {
  if (!info) return []
  const out: string[] = []
  for (const rule of PATIENT_CONTRA_RULES) {
    if (!rule.check()) continue
    const hit = info['Противопоказания'].find((c) =>
      rule.fragments.some((f) => c.toLowerCase().includes(f))
    )
    if (hit) out.push(`${hit} — у пациента: ${rule.label}`)
  }
  return out
}

// Предупреждения по черновому выбору (до назначения)
const draftContraWarnings = computed<string[]>(() => contraWarningsFor(draftDrugInfo.value))
// Предупреждения по назначенному: анамнез мог измениться после назначения
const assignedContraWarnings = computed<string[]>(() => contraWarningsFor(assignedDrugInfo.value))
// Доступные дозы для выбранного препарата (по первому слову названия чернового выбора)
const doseOptions = computed<string[]>(() => {
  const key = (treatmentDrugDraft.value || '').split(' ')[0]
  return DOSE_RANGES[key] || []
})

// Препараты по этапам (норма схемы) — TREATMENT_DRUGS в domain/treatment.ts

const treatmentStageLabel = computed(() => TREATMENT_STAGE_LABELS[visit.treatmentStage] || visit.treatmentStage)
const treatmentDrugs = computed(() => TREATMENT_DRUGS[visit.treatmentStage] || [])

// Следующий этап по схеме — nextTreatmentStage() в domain/treatment.ts

// Рекомендация по текущему шагу: что делать при зафиксированном эффекте
interface TreatmentAdvice {
  text: string
  kind: 'ok' | 'info'
}
const treatmentAdvice = computed<TreatmentAdvice | null>(() => {
  const e = visit.treatmentEffect
  if (!e) {
    if (!treatmentDrugs.value.length) {
      return visit.treatmentStage === 'maintain'
        ? { text: 'При положительном эффекте терапии — продолжить терапию выбранным антидепрессантом не менее 6–12 месяцев (для успешного завершения острого этапа).', kind: 'ok' }
        : { text: 'Резистентность: уточнить диагноз, выявить коморбидные расстройства, доп. обследование, оценка комплаентности и причин резистентности; другие антидепрессанты и комбинации (рисперидон, оланзапин, арипипразол, вальпроевая кислота), более длительные курсы.', kind: 'info' }
    }
    return null
  }
  const nxt = nextTreatmentStage(visit.treatmentStage, e)
  const eff = e === 'full' ? 'полным' : e === 'partial' ? 'частичным' : 'отсутствием эффекта'
  if (nxt === 'maintain') {
    return { text: 'При положительном эффекте терапии — продолжить терапию выбранным антидепрессантом не менее 6–12 месяцев (для успешного завершения острого этапа).', kind: 'ok' }
  }
  const stage: Record<string, string> = {
    dose_max: `При ${eff} — увеличить дозу до максимальной терапевтической, проверить комплаентность; повторная оценка через 4–6 недель.`,
    switch: `При ${eff} — сменить антидепрессант (шаг 1 ветвления неэффективности), оценка через 4–6 недель.`,
    pregabalin: `При ${eff} — назначить прегабалин (шаг 2 ветвления неэффективности).`,
    augmentation: `При ${eff} — аугментация: присоединить препарат к антидепрессанту (шаг 3).`,
    reserve: `При ${eff} — терапия резерва: имипрамин, доксепин, кломипрамин, амитриптилин, буспирон или комбинация АД + прегабалин.`,
    resistant: `При ${eff} — резистентность: уточнить диагноз, выявить коморбидность, доп. обследование, оценка комплаентности; комбинации с рисперидоном, оланзапином, арипипразолом, вальпроевой кислотой; более длительные курсы.`,
  }
  return { text: stage[nxt] || '', kind: 'info' }
})

// Предупреждение о преждевременной оценке (раньше 4 недель)
const treatmentEarlyWarning = computed(() => {
  if (!visit.treatmentEffect) return ''
  if (visit.treatmentStage === 'maintain' || visit.treatmentStage === 'resistant' || !treatmentDrugs.value.length) return ''
  if (visit.treatmentWeeks > 0 && visit.treatmentWeeks < 4) {
    return 'Оценка эффекта ранее 4–6 недель терапии может быть преждевременной — при сомнениях продолжите этап до 4–6 недель.'
  }
  return ''
})

// Смена чернового препарата — сброс дозы (диапазоны у препаратов разные)
watch(
  () => treatmentDrugDraft.value,
  () => {
    visit.treatmentDose = ''
  }
)

// Диагноз «тревога»: любой шифр F либо его маскированные варианты (астенические синдромы для непсихиатрического профиля) —
// только при таком диагнозе открывается блок лечения
const anxietyDiagnosed = computed(
  () => diagnosisHasFCode.value || diagnosisIsAsthenicVegetative.value || diagnosisIsAsthenicDepressive.value || diagnosisIsAsthenia.value
)

// COVID-19 в анамнезе: открывает блок лечения (раздел постковидной астении)
// Немедикаментозная терапия: NON_DRUG_THERAPY — в domain/treatment.ts

const isPostCovid = computed(() => visit.anamnesisFactors.includes('covid19'))

// ===== Дообследование (КР «ГТР» 2024) =====
// Базовый объём — BASE_EXAM_STUDIES, по показаниям — CONDITIONAL_EXAM_STUDIES (domain/treatment.ts)

// Перечень исследований, рекомендованных по данным текущего приёма
const examRecommendedKeys = computed<string[]>(() => {
  const out = new Set<string>()
  // ЭКГ — всем пациентам с ГТР
  if (visit.criteria.length || gadClinical.value || anxietyDiagnosed.value) out.add('ecg')
  // ТТГ/Т3/Т4 — при заболеваниях щитовидной железы в анамнезе
  if (visit.lifeFactors.includes('hypothyroidism') || /щитовид|тиреоид|гипотире/.test(visit.chronicConditions.toLowerCase())) out.add('tsh')
  // ЭЭГ — пароксизмальные состояния, а также синкопы/эпилепсия в анамнезе
  if (visit.examFlags.paroxysmal || visit.anamnesisFactors.includes('syncope') || visit.lifeFactors.includes('epilepsy')) out.add('eeg')
  // ТКДС — потеря сознания / сосудистые нарушения
  if (visit.examFlags.vascular || visit.anamnesisFactors.includes('syncope')) out.add('tcds')
  // МРТ — ЧМТ / новообразования / головные боли / органика
  if (visit.examFlags.organic || visit.lifeFactors.includes('tbi') || /головн(ая|ые) боль|мигрень|цефалг/.test(visit.complaints.toLowerCase())) out.add('mri')
  return [...out]
})

// Назначение препарата: фиксируем препарат, дозу и дату старта; оценка эффекта — только через 4–6 недель
function assignTreatment(): void {
  if (!treatmentDrugDraft.value || !visit.treatmentDose) return
  visit.treatmentDrug = treatmentDrugDraft.value
  visit.treatmentStartDate = visit.date ? dateStrToTs(visit.date.slice(0, 10)) : todayDateTs()
  visit.treatmentWeeks = 0
  visit.treatmentEffect = ''
  treatmentDrugDraft.value = ''
}

// Дата, с которой рекомендована оценка эффекта: старт + 4 недели
const treatmentEvalDate = computed<string>(() => {
  if (!visit.treatmentStartDate) return ''
  return formatDate(visit.treatmentStartDate + 28 * 24 * 60 * 60 * 1000)
})

// Условие доступности оценки: препарат назначен и срок приёма истёк (≥ 4 недель с начала, недели не сбрасываются)
const canEvaluateEffect = computed(() => !!visit.treatmentDrug && visit.treatmentWeeks >= 4)

// Первое установление полного эффекта: ровно один «полный» в истории при активном приёме в поддерживающей фазе
const firstFullEffect = computed(
  () => visit.treatmentStage === 'maintain' && visit.treatmentDrug !== '' && visit.treatmentHistory.filter((c) => c.effect === 'full').length === 1
)

// Фиксация оценки: цикл в историю, переход к следующему этапу по схеме.
// При ПОЛНОМ эффекте цикл НЕ прерывается: препарат сохраняется (поддерживающая фаза 6–12 месяцев),
// счётчик недель продолжает расти, терапию можно корректировать при последующих оценках (рецидив → корректировка).
function applyTreatmentEffect(): void {
  if (!visit.treatmentEffect || !visit.treatmentDrug) return
  visit.treatmentHistory.push({
    stage: visit.treatmentStage,
    drug: visit.treatmentDrug,
    dose: visit.treatmentDose,
    note: visit.treatmentNote,
    weeks: visit.treatmentWeeks,
    effect: visit.treatmentEffect,
    date: todayDateTs(),
  })
  const full = visit.treatmentEffect === 'full'
  visit.treatmentStage = nextTreatmentStage(visit.treatmentStage, visit.treatmentEffect)
  if (full && visit.treatmentStage === 'maintain') {
    // Поддерживающая фаза: приём продолжается на том же препарате и дозе
    visit.treatmentEffect = ''
    return
  }
  // Смена/эскалация терапии: текущее назначение завершено — нужно новое
  visit.treatmentDrug = ''
  visit.treatmentDose = ''
  visit.treatmentNote = ''
  visit.treatmentStartDate = 0
  visit.treatmentWeeks = 0
  visit.treatmentEffect = ''
}
function resetTreatment(): void {
  visit.treatmentStage = 'monotherapy'
  visit.treatmentDrug = ''
  visit.treatmentDose = ''
  visit.treatmentNote = ''
  visit.treatmentStartDate = 0
  visit.treatmentWeeks = 0
  visit.treatmentEffect = ''
  visit.treatmentHistory = []
  treatmentDrugDraft.value = ''
}

function saveVisit(): void {
  if (!selectedId.value || !visit.date) return
  syncAddVisit(selectedId.value, {
    doctor: auth.user!.fullName,
    condition: (visit.condition || 'Без изменений') as Condition,
    notes: visit.notes || '',
    complaints: visit.complaints,
    criteria: [...visit.criteria],
    anamnesis: visit.anamnesis,
    anamnesisFactors: [...visit.anamnesisFactors],
    symptomDuration: visit.symptomDuration,
    chronicConditions: visit.chronicConditions,
    allergies: visit.allergies,
    currentMeds: visit.currentMeds,
    lifeFactors: [...visit.lifeFactors],
    surgeriesTraumas: visit.surgeriesTraumas,
    transfusions: visit.transfusions,
    transfusionsDetails: visit.transfusionsDetails,
    generalStatus: { ...visit.generalStatus },
    neuroQuick: { ...visit.neuroQuick },
    neuroDetailed: { ...visit.neuroDetailed },
    diagnosis: visit.diagnosis,
    diagnosisCode: visit.diagnosisCode,
    diagnosisReason: visit.diagnosisReason,
    // Лечение: состояние курса сохраняется с каждым приёмом и НЕ сбрасывается — курс непрерывен между приёмами
    treatmentStage: visit.treatmentStage,
    treatmentDrug: visit.treatmentDrug,
    treatmentDose: visit.treatmentDose,
    treatmentNote: visit.treatmentNote,
    treatmentStartDate: visit.treatmentStartDate,
    treatmentWeeks: visit.treatmentWeeks,
    treatmentEffect: visit.treatmentEffect,
    treatmentHistory: visit.treatmentHistory.map((c) => ({ ...c })),
    // Дообследование: выполненные исследования и клинические суждения
    examStudies: [...visit.examStudies],
    examFlags: { ...visit.examFlags },
    nonDrugTherapy: [...visit.nonDrugTherapy],
    consultSpecialties: visit.consultSpecialties,
    consultOther: visit.consultOther,
    prescribeAviandr: visit.prescribeAviandr,
    date: dateTimeLocalToTs(visit.date),
  })
  visit.notes = ''
  visit.complaints = ''
  visit.criteria = []
  visit.anamnesis = ''
  visit.anamnesisFactors = []
  visit.symptomDuration = ''
  visit.chronicConditions = ''
  visit.allergies = ''
  visit.currentMeds = ''
  visit.lifeFactors = []
  visit.surgeriesTraumas = ''
  visit.transfusions = false
  visit.transfusionsDetails = ''
  visit.prescribeAviandr = false
  visit.condition = 'Без изменений'
  visit.diagnosis = ''
  visit.diagnosisCode = ''
  visit.diagnosisReason = ''
  // Дообследование: сброс выполненных исследований и суждений
  visit.examStudies = []
  visit.examFlags.paroxysmal = false
  visit.examFlags.vascular = false
  visit.examFlags.organic = false
  // Сброс статусов: выпадающие списки — обратно на «норму», текстовые — пустые
  for (const f of STATUS_ITEMS) visit.generalStatus[f.value] = f.options ? (f.options.find((o) => o.value !== '')?.value ?? '') : ''
  for (const f of NEURO_QUICK_ITEMS) visit.neuroQuick[f.value] = f.options ? (f.options.find((o) => o.value !== '')?.value ?? '') : ''
  for (const f of NEURO_DETAILED_ITEMS) visit.neuroDetailed[f.value] = f.options ? (f.options.find((o) => o.value !== '')?.value ?? '') : ''
  successMsg.value = 'Приём сохранён ✓'
  // После сохранения запись доступна только на просмотр (readonly) — уходим на страницу пациента
  router.push(`/doctor/patient/${selectedId.value}`)
}

function saveTest(): void {
  if (!selectedId.value) return
  syncTest(selectedId.value, { type: test.type, score: test.score, date: dateStrToTs(test.date) })
  successMsgTest.value = 'Результат добавлен ✓'
}

// ─── Экспорт записи приёма ────────────────────────────────────
const exportOpen = ref(false)

/** Человекочитаемые подписи: коды полей формы → текст (для экспорта). */
const FACTOR_LABELS: Record<string, string> = Object.fromEntries(
  ANAMNESIS_GROUPS.flatMap((g) => g.items.map((f) => [f.value, f.label] as const))
)
const DURATION_LABELS: Record<string, string> = {
  less_1m: 'менее 1 месяца',
  '1_6m': '1–6 месяцев',
  more_6m: 'более 6 месяцев',
}
// Критерии ГТР: код «A1», «B3»… → текст пункта (индекс в шаблоне включает строки-подзаголовки)
const CRITERIA_LABELS: Record<string, string> = Object.fromEntries(
  GAD_CRITERIA.flatMap((g) =>
    g.items.map((item, i) => [g.code + (i + 1), item.startsWith('—') ? item.slice(1).trim() : item] as const)
  )
)
const EXAM_LABELS: Record<string, string> = Object.fromEntries(
  [...BASE_EXAM_STUDIES, ...CONDITIONAL_EXAM_STUDIES].map((s) => [s.key, s.label] as const)
)
const NON_DRUG_LABELS: Record<string, string> = Object.fromEntries(
  NON_DRUG_THERAPY.map((n) => [n.key, n.label] as const)
)
const CONSULT_SPECIALTY_LABELS: Record<string, string> = Object.fromEntries(
  CONSULTATION_SPECIALTIES.map((s) => [s.key, s.label] as const)
)
// Число выбранных для бейджа (текст «другого» вводится в свободном поле)
const selectedConsultCount = computed(() => visit.consultSpecialties.length)
// EFFECT_LABELS — в domain/treatment.ts

/** Список кодов факторов → список их текстовых подписей. */
function factorLabels(codes: string[]): string[] {
  return codes.map((c) => FACTOR_LABELS[c] || c)
}

/** Статус осмотра: значение селекта → видимый текст (label опции). */
function statusLabels(items: StatusItem[], source: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of items) {
    const v = source[f.value] || ''
    out[f.label] = (f.options?.find((o) => o.value === v && v !== '')?.label ?? v) || '—'
  }
  return out
}

/** Консультации: подписи выбранного + текст «другого» (для экспорта). */
function consultExportList(): string[] {
  const list = visit.consultSpecialties.map((k) => {
    const label = CONSULT_SPECIALTY_LABELS[k] || k
    return k === 'other' && visit.consultOther.trim()
      ? `${label}: ${visit.consultOther.trim()}`
      : label
  })
  return list
}

/** Снапшот текущей записи приёма для экспорта (JSON / PDF / email). */
function buildVisitExport(): VisitExportData {
  return {
    пациент: selected.value?.fullName ?? '',
    дата_рождения: selected.value?.birthDate ? formatDateStr(selected.value.birthDate) : '—',
    врач: auth.user?.fullName ?? '',
    дата_приёма: formatVisitTs(visitTs.value),
    жалобы: visit.complaints || '—',
    критерии_ГТР: visit.criteria.map((c) => CRITERIA_LABELS[c] || c),
    анамнез_заболевания: visit.anamnesis || '—',
    факторы_анамнеза: factorLabels(visit.anamnesisFactors),
    длительность_симптомов: DURATION_LABELS[visit.symptomDuration] || visit.symptomDuration || '—',
    анамнез_жизни: {
      хронические: visit.chronicConditions || '—',
      аллергии: visit.allergies || '—',
      препараты: visit.currentMeds || '—',
      операции_травмы: visit.surgeriesTraumas || '—',
      гемотрансфузии: visit.transfusions ? visit.transfusionsDetails || 'да' : 'нет',
      факторы: factorLabels(visit.lifeFactors),
    },
    статус: {
      общий: statusLabels(STATUS_ITEMS, visit.generalStatus),
      неврологический: statusLabels(NEURO_QUICK_ITEMS, visit.neuroQuick),
    },
    диагноз: visit.diagnosis || '—',
    код_МКБ10: visit.diagnosisCode || '—',
    дообследование: visit.examStudies.map((k) => EXAM_LABELS[k] || k),
    лечение: {
      этап: TREATMENT_STAGE_LABELS[visit.treatmentStage] || visit.treatmentStage || '—',
      препарат: visit.treatmentDrug || '—',
      доза: visit.treatmentDose || '—',
      // Авиандр: назначен на этом приёме → дозировка из справочника DRUG_INFO
      авиандр: visit.prescribeAviandr ? `назначен — внутрь по ${aviandrDose.value}` : '—',
      немедикаментозная_терапия: visit.nonDrugTherapy.map((k) => NON_DRUG_LABELS[k] || k),
      консультации_специалистов: consultExportList(),
      циклы: visit.treatmentHistory.map((c) => ({
        ...c,
        stage: TREATMENT_STAGE_LABELS[c.stage] || c.stage,
        effect: EFFECT_LABELS[c.effect] || c.effect,
        date: formatDate(c.date),
      })),
    },
    результаты_тестов: getPatient(selectedId.value!).tests.map((t) => ({
      дата: formatDate(t.date),
      шкала: TEST_TYPES[t.type]?.name ?? t.type,
      балл: t.score,
    })),
  }
}

/** JSON: скачать файл с записью приёма. */
function exportJson(): void {
  if (!selectedId.value) return
  exportOpen.value = false
  const fileName = `приём_${selected.value?.username || 'пациент'}_${formatVisitTs(visitTs.value).replace(/[:\s]/g, '-') || formatDate(todayDateTs())}.json`
  successMsg.value = exportVisitJson(buildVisitExport(), fileName)
}

/** PDF / Печать: печатная версия записи (сервис visit-export). */
function exportPdf(): void {
  if (!selectedId.value) return
  exportOpen.value = false
  successMsg.value = exportVisitPdf(buildVisitExport())
}

/** Email: открыть почтовый клиент с текстом записи. */
function exportEmail(): void {
  if (!selectedId.value) return
  exportOpen.value = false
  successMsg.value = exportVisitEmail(buildVisitExport())
}

</script>

<!-- Стили вынесены в src/assets/main.css (.selected, .cond-*) -->
