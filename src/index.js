const course = {
  name: "Programación Backend con Frameworks",
  environment: "Visual Studio Code",
  packageManager: "PNPM",
  status: "Configurado",
};

function createSummary(data) {
  return `${data.name}: entorno ${data.status.toLowerCase()}`;
}

const summary = createSummary(course);

console.log(summary);
console.table(course);
