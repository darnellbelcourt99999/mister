"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ast_1 = require("./ast");
const JSONBuilder_1 = require("./JSONBuilder");
const typeChecker_1 = require("./typeChecker");
//@ts-ignore
const path = require("path");
class JSONTransformer extends ast_1.Transform {
    afterParse(parser) {
        this.parser = parser;
        const writeFile = this.writeFile;
        const baseDir = this.baseDir;
        // Filter for near files
        let files = JSONBuilder_1.JSONBindingsBuilder.nearFiles(parser);
        JSONTransformer.isTest = files.map(source => source.normalizedPath).some(path => path.includes("spec"));
        // Visit each file
        files.forEach(source => {
            let writeOut = /\/\/.*@nearfile .*out/.test(source.text);
            // Remove from logs in parser
            parser.donelog.delete(source.internalPath);
            parser.seenlog.delete(source.internalPath);
            // Remove from programs sources
            parser.program.sources = parser.program.sources.filter((_source) => _source !== source);
            // Build new Source
            let sourceText = JSONBuilder_1.JSONBindingsBuilder.build(parser, source);
            if (writeOut) {
                writeFile("out/" + source.normalizedPath, sourceText, baseDir);
            }
            // Parses file and any new imports added to the source
            parser.parseFile(sourceText, (JSONBuilder_1.isEntry(source) ? "" : "./") + source.normalizedPath, JSONBuilder_1.isEntry(source));
        });
        //@ts-ignore __dirname exists
        const entryFile = this.readFile("../assembly/index.ts", __dirname);
        //@ts-ignore __dirname exists
        this.parser.parseFile(entryFile, path.join(__dirname, "../assembly/index.ts"), true);
        if (!JSONTransformer.isTest) {
            typeChecker_1.TypeChecker.check(parser);
        }
    }
    /** Check for floats */
    afterCompile(module) {
        if (!JSONTransformer.isTest) {
            typeChecker_1.TypeChecker.checkBinary(module);
        }
    }
}
exports.JSONTransformer = JSONTransformer;
JSONTransformer.isTest = false;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNmb3JtZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHJhbnNmb3JtZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBMEQ7QUFDMUQsK0NBQTZEO0FBQzdELCtDQUE0QztBQUM1QyxZQUFZO0FBQ1osNkJBQTZCO0FBRTdCLE1BQU0sZUFBZ0IsU0FBUSxlQUFTO0lBSXJDLFVBQVUsQ0FBQyxNQUFjO1FBQ3ZCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDakMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUU3Qix3QkFBd0I7UUFDeEIsSUFBSSxLQUFLLEdBQUcsaUNBQW1CLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELGVBQWUsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDeEcsa0JBQWtCO1FBQ2xCLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDckIsSUFBSSxRQUFRLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6RCw2QkFBNkI7WUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzQywrQkFBK0I7WUFDL0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUNwRCxDQUFDLE9BQWUsRUFBRSxFQUFFLENBQUMsT0FBTyxLQUFLLE1BQU0sQ0FDeEMsQ0FBQztZQUNGLG1CQUFtQjtZQUNuQixJQUFJLFVBQVUsR0FBRyxpQ0FBbUIsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzNELElBQUksUUFBUSxFQUFFO2dCQUNaLFNBQVMsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLGNBQWMsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7YUFDaEU7WUFDRCxzREFBc0Q7WUFDdEQsTUFBTSxDQUFDLFNBQVMsQ0FDZCxVQUFVLEVBQ1YsQ0FBQyxxQkFBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxjQUFjLEVBQ3JELHFCQUFPLENBQUMsTUFBTSxDQUFDLENBQ2hCLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUNILDZCQUE2QjtRQUM3QixNQUFNLFNBQVMsR0FBVyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNFLDZCQUE2QjtRQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsc0JBQXNCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVyRixJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtZQUMzQix5QkFBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUMzQjtJQUNILENBQUM7SUFFRCx1QkFBdUI7SUFDdkIsWUFBWSxDQUFDLE1BQWM7UUFDekIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUU7WUFDM0IseUJBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDakM7SUFDSCxDQUFDOztBQUdNLDBDQUFlO0FBbERmLHNCQUFNLEdBQVksS0FBSyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVHJhbnNmb3JtLCBQYXJzZXIsIFNvdXJjZSwgTW9kdWxlIH0gZnJvbSBcIi4vYXN0XCI7XG5pbXBvcnQgeyBKU09OQmluZGluZ3NCdWlsZGVyLCBpc0VudHJ5IH0gZnJvbSBcIi4vSlNPTkJ1aWxkZXJcIjtcbmltcG9ydCB7IFR5cGVDaGVja2VyIH0gZnJvbSBcIi4vdHlwZUNoZWNrZXJcIjtcbi8vQHRzLWlnbm9yZVxuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuXG5jbGFzcyBKU09OVHJhbnNmb3JtZXIgZXh0ZW5kcyBUcmFuc2Zvcm0ge1xuICBwYXJzZXI6IFBhcnNlcjtcbiAgc3RhdGljIGlzVGVzdDogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIGFmdGVyUGFyc2UocGFyc2VyOiBQYXJzZXIpOiB2b2lkIHtcbiAgICB0aGlzLnBhcnNlciA9IHBhcnNlcjtcbiAgICBjb25zdCB3cml0ZUZpbGUgPSB0aGlzLndyaXRlRmlsZTtcbiAgICBjb25zdCBiYXNlRGlyID0gdGhpcy5iYXNlRGlyO1xuXG4gICAgLy8gRmlsdGVyIGZvciBuZWFyIGZpbGVzXG4gICAgbGV0IGZpbGVzID0gSlNPTkJpbmRpbmdzQnVpbGRlci5uZWFyRmlsZXMocGFyc2VyKTtcbiAgICBKU09OVHJhbnNmb3JtZXIuaXNUZXN0ID0gZmlsZXMubWFwKHNvdXJjZSA9PiBzb3VyY2Uubm9ybWFsaXplZFBhdGgpLnNvbWUocGF0aCA9PiBwYXRoLmluY2x1ZGVzKFwic3BlY1wiKSk7XG4gICAgLy8gVmlzaXQgZWFjaCBmaWxlXG4gICAgZmlsZXMuZm9yRWFjaChzb3VyY2UgPT4ge1xuICAgICAgbGV0IHdyaXRlT3V0ID0gL1xcL1xcLy4qQG5lYXJmaWxlIC4qb3V0Ly50ZXN0KHNvdXJjZS50ZXh0KTtcbiAgICAgIC8vIFJlbW92ZSBmcm9tIGxvZ3MgaW4gcGFyc2VyXG4gICAgICBwYXJzZXIuZG9uZWxvZy5kZWxldGUoc291cmNlLmludGVybmFsUGF0aCk7XG4gICAgICBwYXJzZXIuc2VlbmxvZy5kZWxldGUoc291cmNlLmludGVybmFsUGF0aCk7XG4gICAgICAvLyBSZW1vdmUgZnJvbSBwcm9ncmFtcyBzb3VyY2VzXG4gICAgICBwYXJzZXIucHJvZ3JhbS5zb3VyY2VzID0gcGFyc2VyLnByb2dyYW0uc291cmNlcy5maWx0ZXIoXG4gICAgICAgIChfc291cmNlOiBTb3VyY2UpID0+IF9zb3VyY2UgIT09IHNvdXJjZVxuICAgICAgKTtcbiAgICAgIC8vIEJ1aWxkIG5ldyBTb3VyY2VcbiAgICAgIGxldCBzb3VyY2VUZXh0ID0gSlNPTkJpbmRpbmdzQnVpbGRlci5idWlsZChwYXJzZXIsIHNvdXJjZSk7XG4gICAgICBpZiAod3JpdGVPdXQpIHtcbiAgICAgICAgd3JpdGVGaWxlKFwib3V0L1wiICsgc291cmNlLm5vcm1hbGl6ZWRQYXRoLCBzb3VyY2VUZXh0LCBiYXNlRGlyKTtcbiAgICAgIH1cbiAgICAgIC8vIFBhcnNlcyBmaWxlIGFuZCBhbnkgbmV3IGltcG9ydHMgYWRkZWQgdG8gdGhlIHNvdXJjZVxuICAgICAgcGFyc2VyLnBhcnNlRmlsZShcbiAgICAgICAgc291cmNlVGV4dCxcbiAgICAgICAgKGlzRW50cnkoc291cmNlKSA/IFwiXCIgOiBcIi4vXCIpICsgc291cmNlLm5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0VudHJ5KHNvdXJjZSlcbiAgICAgICk7XG4gICAgfSk7XG4gICAgLy9AdHMtaWdub3JlIF9fZGlybmFtZSBleGlzdHNcbiAgICBjb25zdCBlbnRyeUZpbGU6IHN0cmluZyA9IHRoaXMucmVhZEZpbGUoXCIuLi9hc3NlbWJseS9pbmRleC50c1wiLCBfX2Rpcm5hbWUpO1xuICAgIC8vQHRzLWlnbm9yZSBfX2Rpcm5hbWUgZXhpc3RzXG4gICAgdGhpcy5wYXJzZXIucGFyc2VGaWxlKGVudHJ5RmlsZSwgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9hc3NlbWJseS9pbmRleC50c1wiKSwgdHJ1ZSk7XG5cbiAgICBpZiAoIUpTT05UcmFuc2Zvcm1lci5pc1Rlc3QpIHtcbiAgICAgIFR5cGVDaGVja2VyLmNoZWNrKHBhcnNlcik7XG4gICAgfVxuICB9XG4gIFxuICAvKiogQ2hlY2sgZm9yIGZsb2F0cyAqL1xuICBhZnRlckNvbXBpbGUobW9kdWxlOiBNb2R1bGUpOiB2b2lkIHtcbiAgICBpZiAoIUpTT05UcmFuc2Zvcm1lci5pc1Rlc3QpIHtcbiAgICAgIFR5cGVDaGVja2VyLmNoZWNrQmluYXJ5KG1vZHVsZSk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCB7IEpTT05UcmFuc2Zvcm1lciB9O1xuIl19