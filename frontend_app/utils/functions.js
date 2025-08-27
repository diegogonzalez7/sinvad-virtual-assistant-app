import styles from '../styles';

// Función para procesar un flujo y calcular duración estimada
export function processFlow(flow) {
  const stepNameToId = {};
  flow.steps.forEach(step => {
    stepNameToId[step.name[0].text] = step.id;
    stepNameToId[step.title[0].text] = step.id;
  });

  const graph = {};
  flow.nextSteps.forEach(transition => {
    const { prevStep, nextStep, conditions } = transition;
    if (!graph[prevStep]) graph[prevStep] = [];
    graph[prevStep].push({ nextStep, conditions });
  });

  // Duración estimada: 1 minuto por nodo
  const nodeCount = flow.steps.length;
  const duracionEstimada = nodeCount * 1; // En minutos

  return { stepNameToId, graph, duracionEstimada };
}

// Función para parsear opciones dentro de los chips
export function parseOptions(questionText, stepNameToId, nextSteps) {
  const options = [];
  const regex = /::chip::([^:]+)::text::([^:]+)::chip::/g;
  let match;
  while ((match = regex.exec(questionText)) !== null) {
    const optionText = match[1].trim();
    const nextStepName = match[2].trim();
    const nextStepId = stepNameToId[nextStepName] || nextStepName;
    options.push({ text: optionText, nextStep: nextStepId });
  }
  if (!regex.test(questionText) && nextSteps.some(t => t.nextStep !== '0')) {
    const nextStep = nextSteps.find(t => t.conditions === '-');
    if (nextStep) {
      options.push({ text: 'Continuar', nextStep: nextStep.nextStep, isTextInput: true });
    }
  }
  return options;
}

// Función para limpiar el texto de las opciones de chip
export function cleanAssistantMessage(questionText) {
  return questionText.replace(/::chip::[^:]+::text::[^:]+::chip::/g, '').trim();
}

// Función para encontrar un paso por ID
export function findStep(stepId, flow) {
  return flow.steps.find(step => step.id === stepId);
}

// Función para encontrar el siguiente paso
export function findNextStep(currentStepId, selectedOptionText, flow, graph, stepNameToId, isTextInput = false) {
  const step = findStep(currentStepId, flow);
  const options = step ? parseOptions(step.question[0].text, stepNameToId, graph[currentStepId] || []) : [];
  const transitions = graph[currentStepId] || [];

  if (!selectedOptionText && options.length === 0) {
    const transition = transitions.find(t => t.conditions === '-');
    return transition ? transition.nextStep : null;
  }

  if (isTextInput && options[0]?.isTextInput) {
    return options[0].nextStep;
  }

  const selectedOption = options.find(opt => opt.text.toLowerCase() === selectedOptionText?.toLowerCase());

  if (!selectedOption) {
    console.log(`Debug: No se encontró la opción "${selectedOptionText}"`);
    return null;
  }

  let transition = transitions.find(t => t.nextStep === selectedOption.nextStep);
  if (!transition) {
    transition = transitions.find(t => t.conditions === '-');
    if (!transition) {
      console.log(`Debug: No se encontró transición para prevStep=${currentStepId}, nextStep=${selectedOption.nextStep}`);
      return null;
    }
  }

  return transition.nextStep;
}

// Función auxiliar para calcular el tiempo restante para el borrado automático
export const formatRemainingTime = minutes => {
  const totalMinutes = minutes;
  const remainingMinutes = Math.floor(totalMinutes % 60);
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const days = Math.floor(totalMinutes / (24 * 60));

  let result = [];
  if (days > 0) {
    result.push(days > 1 ? `${days} días` : `${days} día`);
  }
  if (hours > 0) {
    result.push(`${hours} horas`);
  }
  if (remainingMinutes > 0) {
    result.push(`${remainingMinutes} minutos`);
  }

  return result.length > 0 ? result.join(' y ') : '0 minutos';
};

// Función auxiliar para formatear el timestamp
export const formatTimestamp = timestamp => {
  const date = new Date(timestamp);
  return `${date.getDate()} de ${date.toLocaleString('es-ES', { month: 'long' })} de ${date.getFullYear()}, ${date.getHours()}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

// Función auxiliar para determinar el color del tiempo restante
export const getTimeColor = timeRemaining => {
  const maxMinutes = 7 * 24 * 60; // 10,080 minutos
  const percentage = (timeRemaining / maxMinutes) * 100;
  return percentage >= 50 ? styles.remainingTimeGreen : percentage >= 15 ? styles.remainingTimeOrange : styles.remainingTimeRed;
};

// Función auxiliar para determinar el estilo del informe
export const getItemStyle = history => {
  const lastStep = history[history.length - 1]?.stepTitle || '';
  return lastStep === 'InfPos' ? styles.greenItem : styles.redItem;
};
