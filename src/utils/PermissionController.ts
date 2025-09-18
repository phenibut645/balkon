interface NextFunction {
  (userId: string, guildId: string): boolean;
}

export function permissionController(next: NextFunction){

}