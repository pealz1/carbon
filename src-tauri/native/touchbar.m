#import <AppKit/AppKit.h>

// Installed on the main window; AppKit only presents it on a Touch Bar-capable Mac.
typedef void (*CarbonControl)(int, double);
@interface CarbonTouchBar : NSObject<NSTouchBarDelegate>
@property(nonatomic) CarbonControl sendControl;
@property(nonatomic,strong) NSTextField *song;
@property(nonatomic,strong) NSButton *transport;
@property(nonatomic,strong) NSSlider *seek;
@end
static CarbonTouchBar *controller;
@implementation CarbonTouchBar
- (void)command:(NSControl *)sender {
    self.sendControl((int)sender.tag, sender.tag==3?sender.doubleValue:0);
}
- (NSTouchBarItem *)touchBar:(NSTouchBar *)touchBar makeItemForIdentifier:(NSTouchBarItemIdentifier)identifier {
    NSCustomTouchBarItem *item=[[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
    if ([identifier isEqualToString:@"carbon.title"]) { item.view=self.song; item.customizationLabel=@"Now playing"; return item; }
    if ([identifier isEqualToString:@"carbon.seek"]) { item.view=self.seek; item.customizationLabel=@"Playback position"; return item; }
    NSArray *ids=@[@"carbon.prev",@"carbon.play",@"carbon.next"];
    NSUInteger index=[ids indexOfObject:identifier]; if(index==NSNotFound)return nil;
    NSString *name=@[@"Previous",@"Play or pause",@"Next"][index];
    NSButton *button=[NSButton buttonWithImage:[NSImage imageWithSystemSymbolName:@[@"backward.end.fill",@"play.fill",@"forward.end.fill"][index] accessibilityDescription:name] target:self action:@selector(command:)];
    button.tag=(NSInteger)index; [button setAccessibilityLabel:name]; item.view=button;item.customizationLabel=name;
    if(index==1)self.transport=button;
    return item;
}
@end

void carbon_touch_install(void *ptr,CarbonControl send) {
    NSWindow *win=(__bridge NSWindow *)ptr;
    controller=[CarbonTouchBar new];controller.sendControl=send;
    controller.song=[NSTextField labelWithString:@"Carbon"];
    controller.song.lineBreakMode=NSLineBreakByTruncatingTail;
    controller.seek=[NSSlider sliderWithValue:0 minValue:0 maxValue:1 target:controller action:@selector(command:)];
    controller.seek.tag=3;controller.seek.continuous=NO;[controller.seek setAccessibilityLabel:@"Playback position"];
    NSTouchBar *bar=[NSTouchBar new];bar.delegate=controller;bar.customizationIdentifier=@"cc.getcarbon.music";
    bar.defaultItemIdentifiers=@[@"carbon.prev",@"carbon.play",@"carbon.next",@"carbon.title",@"carbon.seek"];
    bar.customizationAllowedItemIdentifiers=bar.defaultItemIdentifiers;win.touchBar=bar;
}
void carbon_touch_update(const char *title, bool playing, double position, double duration) {
    NSString *name=[NSString stringWithUTF8String:title] ?: @"Carbon";
    dispatch_async(dispatch_get_main_queue(),^{
        controller.song.stringValue=name;
        controller.transport.image=[NSImage imageWithSystemSymbolName:playing?@"pause.fill":@"play.fill" accessibilityDescription:playing?@"Pause":@"Play"];
        controller.seek.enabled=duration>0;
        controller.seek.maxValue=MAX(1,duration);
        if(!controller.seek.cell.isHighlighted)controller.seek.doubleValue=position;
    });
}
