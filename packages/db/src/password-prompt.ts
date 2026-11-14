export async function requestPassword(question: (message: string) => Promise<string>, report: (message: string) => void, validate: (password: string) => string | undefined = password => password.length < 12 || password.length > 1024 ? "A senha deve ter de 12 a 1024 caracteres. Tente novamente." : undefined, message = "Senha com 12 a 1024 caracteres: "): Promise<string> {
  while (true) {
    const password = await question(message);
    const error = validate(password);
    if (error) {
      report(error);
      continue;
    }
    const confirmation = await question("Confirme a senha: ");
    if (password !== confirmation) {
      report("As senhas não coincidem. Tente novamente.");
      continue;
    }
    return password;
  }
}
